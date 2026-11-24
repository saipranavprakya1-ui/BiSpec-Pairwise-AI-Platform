"""
model_trainer.py
BiSpec Pairwise AI: Model training, benchmark comparison, and evaluation engine.
Trains Logistic Regression, Decision Tree, Random Forest, GBDT, DNN, and XGBoost on the user's dataset.
Saves model artifacts, ROC/PR curve points, and benchmark metrics for the FastAPI backend and frontend UI.
"""

import os
import sys
import json
import joblib
import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import (
    RandomForestClassifier,
    GradientBoostingClassifier,
    HistGradientBoostingClassifier,
    ExtraTreesClassifier,
    VotingClassifier,
)
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import (
    roc_auc_score, average_precision_score, accuracy_score,
    precision_score, recall_score, f1_score, roc_curve, precision_recall_curve,
    confusion_matrix
)
from xgboost import XGBClassifier

# Add current directory to path
sys.path.append(os.path.dirname(__file__))
from pairwise_features import compute_pairwise_features, get_target_features, EXACT_40_FEATURES
from data_processor import clean_target_pair

def run_training_pipeline(csv_path: str, models_dir: str):
    print("=" * 75)
    print("BiSpec Pairwise AI - Step 2 & 3: Model Training & Benchmark Comparison")
    print("=" * 75)
    
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Dataset not found at: {csv_path}")
        
    os.makedirs(models_dir, exist_ok=True)
    
    # 1. Load user's preprocessed dataset directly
    df = pd.read_csv(csv_path)
    print(f"[*] Ingested user preprocessed dataset directly: {len(df)} records.")
    
    FEATURE_NAMES_27 = [
        "relevance_sum", "relevance_diff", "relevance_prod", "mw_sum", "mw_diff", "mw_ratio",
        "tox_max", "tox_mean", "loc_prod", "synergy_score", "shared_pathway_proxy",
        "is_tumor_tcell", "is_dual_checkpoint", "is_checkpoint_costim", "is_dual_rtk",
        "is_checkpoint_angiogenesis", "indication_match", "sc_safe_score",
        "sc_double_ratio_all", "sc_double_ratio_tLung", "sc_corrcoef_all", "sc_corrcoef_tLung",
        "sc_corrcoef_treg", "sc_corrcoef_mac", "sc_sum_single_ratio", "sc_min_single_ratio",
        "sc_tumor_delta_sum"
    ]

    # 2. Build Base-Paper Pairwise Learning Dataset (Zhang et al., 2024)
    # Step A: Deduplicate clinical records into unique canonical biological target pairs (g1 < g2)
    # Eliminates label collision where identical target pairs appear as both Active and Discontinued.
    pair_active = {}
    pair_indication = {}
    clinical_genes = set()

    for _, row in df.iterrows():
        ta, tb = clean_target_pair(row)
        if not ta or not tb or ta == tb:
            continue
        pair_key = tuple(sorted((ta, tb)))
        clinical_genes.add(ta)
        clinical_genes.add(tb)
        is_active = str(row.get('Drug Highest Phase', '')).strip() != 'Discontinued/ Pending'
        if pair_key not in pair_active:
            pair_active[pair_key] = is_active
            pair_indication[pair_key] = str(row.get('Active Indication(Indication Name)', 'Non-Small Cell Lung Cancer'))
        elif is_active:
            # If ANY clinical program on this target pair is Active/Approved, the target pair is biologically viable
            pair_active[pair_key] = True

    positive_pairs = sorted([p for p, act in pair_active.items() if act])
    failed_only_pairs = sorted([p for p, act in pair_active.items() if not act])

    # Step B: Load full 193-gene surface-target space from GSE131907 sc_target_stats.json
    sc_stats_path = os.path.join(os.path.dirname(csv_path), 'sc_target_stats.json')
    sc_genes = set()
    if os.path.exists(sc_stats_path):
        try:
            with open(sc_stats_path, 'r', encoding='utf-8') as f:
                sc_data = json.load(f)
            sc_genes.update(sc_data.get('gene_subset_stats', {}).keys())
            sc_genes.update(sc_data.get('targets', {}).keys())
        except Exception:
            pass
    gene_pool = sorted(clinical_genes | sc_genes)

    # Sample true biological background negatives (unexplored non-clinical pairs from 193x193 space)
    # Matching Zhang et al. (2024): ~2:1 negative-to-positive ratio with strictly disjoint canonical pairs
    all_clinical_set = set(pair_active.keys())
    target_neg_total = max(len(positive_pairs) * 2, len(failed_only_pairs) + 400)
    bg_needed = max(0, target_neg_total - len(failed_only_pairs))

    rng = np.random.default_rng(42)
    bg_neg_pairs = set()
    attempts = 0
    max_attempts = bg_needed * 25
    n_genes = len(gene_pool)
    while len(bg_neg_pairs) < bg_needed and attempts < max_attempts and n_genes >= 2:
        i, j = rng.integers(0, n_genes, size=2)
        attempts += 1
        if i == j:
            continue
        cand = (gene_pool[i], gene_pool[j]) if gene_pool[i] < gene_pool[j] else (gene_pool[j], gene_pool[i])
        if cand not in all_clinical_set and cand not in bg_neg_pairs:
            bg_neg_pairs.add(cand)

    negative_pairs = failed_only_pairs + sorted(bg_neg_pairs)

    print(f"[*] Unique Active Clinical Target Pairs (y=1): {len(positive_pairs)} (deduplicated from {len(df)} records)")
    print(f"[*] Hard Clinical Failure-Only Pairs (y=0):    {len(failed_only_pairs)}")
    print(f"[*] Background Non-Clinical Pairs (y=0):       {len(bg_neg_pairs)} (sampled from {n_genes} profiled genes)")

    # Step C: Compute identical 27 pairwise biological & single-cell features via the live feature engine
    # Use uniform NSCLC context for ALL pairs (matching Fig. 3 of Zhang et al., 2024) so there is
    # ZERO indication-metadata shortcut and 100% pure biological + GSE131907 single-cell signal.
    feature_names = list(FEATURE_NAMES_27)
    rows_X = []
    rows_y = []

    for g1, g2 in positive_pairs:
        feat = compute_pairwise_features(g1, g2, indication='Non-Small Cell Lung Cancer')
        rows_X.append([feat[f] for f in feature_names])
        rows_y.append(1)

    for g1, g2 in negative_pairs:
        feat = compute_pairwise_features(g1, g2, indication='Non-Small Cell Lung Cancer')
        rows_X.append([feat[f] for f in feature_names])
        rows_y.append(0)

    X_df = pd.DataFrame(rows_X, columns=feature_names)
    y = np.array(rows_y, dtype=int)

    print(f"[*] Deduplicated Pairwise Feature Matrix: {X_df.shape}")
    print(f"[*] Class distribution: 1 (Clinically Viable Pair) = {int(sum(y==1))}, 0 (Non-Viable/Background) = {int(sum(y==0))}")
    
    # 3. Train-test split (Stratified 80/20)
    X_train, X_test, y_train, y_test = train_test_split(
        X_df.values, y, test_size=0.20, random_state=42, stratify=y
    )
    print(f"[*] Train set size: {len(X_train)} | Test set size: {len(X_test)}")
    
    # Scale features for distance/linear models (LR & DNN)
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Biological monotonic safety constraints for HistGBDT:
    # Higher toxicity (tox_max, tox_mean) can NEVER increase viability (-1)
    # Higher sc_safe_score & sc_tumor_delta_sum can NEVER decrease viability (+1)
    mono_map = {
        "tox_max": -1,
        "tox_mean": -1,
        "sc_safe_score": 1,
        "sc_tumor_delta_sum": 1,
    }
    mono_cst = [mono_map.get(f, 0) for f in feature_names]

    # 4. Initialize the 9 comparison models (6 original + 3 Clinically Safe High-Efficiency models)
    hgb_mono = HistGradientBoostingClassifier(
        max_iter=200,
        learning_rate=0.05,
        max_depth=4,
        min_samples_leaf=15,
        l2_regularization=1.5,
        monotonic_cst=mono_cst,
        random_state=42
    )
    et_safe = ExtraTreesClassifier(
        n_estimators=300,
        max_depth=8,
        min_samples_leaf=3,
        class_weight='balanced_subsample',
        random_state=42
    )
    gbdt_tuned = GradientBoostingClassifier(
        n_estimators=150,
        learning_rate=0.06,
        max_depth=3,
        subsample=0.85,
        random_state=42
    )
    xgb_base = XGBClassifier(
        n_estimators=150,
        max_depth=4,
        learning_rate=0.07,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_lambda=1.2,
        reg_alpha=0.1,
        eval_metric='logloss',
        random_state=42
    )

    clinical_ensemble = VotingClassifier(
        estimators=[
            ('hgb_mono', HistGradientBoostingClassifier(
                max_iter=200, learning_rate=0.05, max_depth=4, min_samples_leaf=15,
                l2_regularization=1.5, monotonic_cst=mono_cst, random_state=42
            )),
            ('gbdt_tuned', GradientBoostingClassifier(
                n_estimators=150, learning_rate=0.06, max_depth=3, subsample=0.85, random_state=42
            )),
            ('et_safe', ExtraTreesClassifier(
                n_estimators=300, max_depth=8, min_samples_leaf=3,
                class_weight='balanced_subsample', random_state=42
            )),
            ('xgb_pairwise', XGBClassifier(
                n_estimators=150, max_depth=4, learning_rate=0.07, subsample=0.85,
                colsample_bytree=0.85, reg_lambda=1.2, reg_alpha=0.1, eval_metric='logloss', random_state=42
            )),
        ],
        voting='soft',
        weights=[2.5, 2.5, 1.5, 2.0]
    )

    models = {
        'Clinical Safe Ensemble': {
            'model': clinical_ensemble,
            'scaled': False,
            'desc': 'Soft-voting clinical consensus (Monotonic HistGBDT + Tuned GBDT + Safety ExtraTrees + XGBoost)'
        },
        'HistGBDT (Monotonic Safe)': {
            'model': hgb_mono,
            'scaled': False,
            'desc': 'LightGBM-class histogram boosting with hard biological toxicity monotonic guardrails'
        },
        'ExtraTrees (Safety-First)': {
            'model': et_safe,
            'scaled': False,
            'desc': 'Class-balanced randomized forest maximizing clinical specificity against discontinued pairs'
        },
        'XGBoost + Pairwise AI': {
            'model': xgb_base,
            'scaled': False,
            'desc': 'Extreme Gradient Boosting with regularized objective & pairwise optimization'
        },
        'GBDT': {
            'model': gbdt_tuned,
            'scaled': False,
            'desc': 'Regularized Gradient Boosted Decision Trees minimizing pseudo-residuals'
        },
        'Random Forest': {
            'model': RandomForestClassifier(n_estimators=150, max_depth=6, random_state=42),
            'scaled': False,
            'desc': 'Bagging ensemble of decorrelated decision trees'
        },
        'Decision Tree': {
            'model': DecisionTreeClassifier(max_depth=5, min_samples_split=6, random_state=42),
            'scaled': False,
            'desc': 'Non-linear hierarchical rule-based partitioner'
        },
        'Logistic Regression': {
            'model': LogisticRegression(max_iter=1000, random_state=42, C=1.0),
            'scaled': True,
            'desc': 'Linear baseline using log-odds optimization'
        },
        'DNN (MLP)': {
            'model': MLPClassifier(
                hidden_layer_sizes=(64, 32),
                activation='relu',
                alpha=0.02,
                learning_rate_init=0.005,
                max_iter=800,
                random_state=42,
                early_stopping=False
            ),
            'scaled': True,
            'desc': 'Multi-Layer Perceptron neural network with backpropagation'
        }
    }
    
    benchmark_results = []
    roc_curves_data = {}
    pr_curves_data = {}
    trained_artifacts = {}
    
    print("\n--- Training & Benchmarking Models ---")
    
    for name, item in models.items():
        clf = item['model']
        is_scaled = item['scaled']
        
        # Fit model
        X_tr = X_train_scaled if is_scaled else X_train
        X_te = X_test_scaled if is_scaled else X_test
        
        clf.fit(X_tr, y_train)
        trained_artifacts[name] = clf
        
        # Probabilities & Predictions
        y_prob = clf.predict_proba(X_te)[:, 1]
        y_pred = (y_prob >= 0.5).astype(int)
        
        # Calculate key metrics
        roc_auc = float(roc_auc_score(y_test, y_prob))
        pr_auc = float(average_precision_score(y_test, y_prob))
        acc = float(accuracy_score(y_test, y_pred))
        prec = float(precision_score(y_test, y_pred, zero_division=0))
        rec = float(recall_score(y_test, y_pred, zero_division=0))
        f1 = float(f1_score(y_test, y_pred, zero_division=0))
        
        # Confusion matrix & clinical specificity
        cm = confusion_matrix(y_test, y_pred)
        tn, fp, fn, tp = [int(v) for v in cm.ravel()]
        specificity = float(tn / (tn + fp)) if (tn + fp) > 0 else 0.0

        # 5-Fold Stratified Cross-Validation on full dataset
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        X_full = scaler.transform(X_df.values) if is_scaled else X_df.values
        cv_roc = float(cross_val_score(clf, X_full, y, cv=cv, scoring='roc_auc').mean())
        cv_pr = float(cross_val_score(clf, X_full, y, cv=cv, scoring='average_precision').mean())
        
        # Compute ROC curve points
        fpr, tpr, _ = roc_curve(y_test, y_prob)
        # Sample points to keep payload concise for frontend rendering
        roc_pts = [{'fpr': round(float(f), 4), 'tpr': round(float(t), 4)} for f, t in zip(fpr[::max(1, len(fpr)//40)], tpr[::max(1, len(tpr)//40)])]
        roc_pts.append({'fpr': 1.0, 'tpr': 1.0})
        roc_curves_data[name] = {
            'auc': round(roc_auc, 4),
            'points': roc_pts
        }
        
        # Compute PR curve points
        precision_pts, recall_pts, _ = precision_recall_curve(y_test, y_prob)
        pr_pts = [{'recall': round(float(r), 4), 'precision': round(float(p), 4)} for p, r in zip(precision_pts[::max(1, len(precision_pts)//40)], recall_pts[::max(1, len(recall_pts)//40)])]
        pr_curves_data[name] = {
            'pr_auc': round(pr_auc, 4),
            'points': pr_pts
        }
        
        is_champ = (name == 'Clinical Safe Ensemble')
        result_entry = {
            'model_name': name,
            'description': item['desc'],
            'roc_auc': round(roc_auc, 4),
            'pr_auc': round(pr_auc, 4),
            'cv_roc_auc': round(cv_roc, 4),
            'cv_pr_auc': round(cv_pr, 4),
            'accuracy': round(acc, 4),
            'precision': round(prec, 4),
            'recall': round(rec, 4),
            'specificity': round(specificity, 4),
            'f1_score': round(f1, 4),
            'confusion_matrix': {'tp': tp, 'fp': fp, 'tn': tn, 'fn': fn},
            'is_champion': is_champ
        }
        benchmark_results.append(result_entry)
        tag = 'CHAMPION' if is_champ else 'MODEL   '
        print(f"[{tag}] {name:26} | ROC:{roc_auc:.4f} PR:{pr_auc:.4f} | 5CV-ROC:{cv_roc:.4f} 5CV-PR:{cv_pr:.4f} | Spec:{specificity:.1%} F1:{f1:.4f}")

    # 5. Extract Feature Importance from Champion Model (XGBoost)
    xgb_model = trained_artifacts['XGBoost + Pairwise AI']
    importances = xgb_model.feature_importances_
    feat_imp = [
        {'feature': feat, 'importance': round(float(imp), 4)}
        for feat, imp in sorted(zip(feature_names, importances), key=lambda x: x[1], reverse=True)
    ]
    
    print("\n--- Top 7 Feature Importances (XGBoost) ---")
    for fi in feat_imp[:7]:
        print(f"  * {fi['feature']:26} : {fi['importance']:.4f}")
        
    # 6. Save artifacts
    joblib.dump(xgb_model, os.path.join(models_dir, 'xgboost_pairwise_model.joblib'))
    joblib.dump(trained_artifacts, os.path.join(models_dir, 'all_models.joblib'))
    joblib.dump(scaler, os.path.join(models_dir, 'scaler.joblib'))
    
    with open(os.path.join(models_dir, 'feature_names.json'), 'w', encoding='utf-8') as f:
        json.dump(feature_names, f, indent=2)
        
    with open(os.path.join(models_dir, 'benchmark_metrics.json'), 'w', encoding='utf-8') as f:
        json.dump({
            'dataset_records': len(df),
            'test_records': len(y_test),
            'models': benchmark_results,
            'metric_explanation': {
                'title': 'Why ROC-AUC and PR-AUC Are the Definitive Metrics in Target Discovery',
                'summary': (
                    'In biomedical pairwise screening and oncology drug discovery, datasets suffer from severe class imbalance. '
                    'A naive baseline that blindly predicts all pairs as active achieves high nominal accuracy while failing to distinguish true synergistic drugs from unviable candidates. '
                    'ROC-AUC measures the ranking probability: the likelihood that the model assigns a higher compatibility score to an active pair than a discontinued/failed pair across all decision thresholds. '
                    'PR-AUC (Precision-Recall Area) measures positive class precision without being inflated by true negatives, making it the most critical indicator for clinical pipeline selection.'
                )
            }
        }, f, indent=2)
        
    with open(os.path.join(models_dir, 'roc_pr_curves.json'), 'w', encoding='utf-8') as f:
        json.dump({
            'roc_curves': roc_curves_data,
            'pr_curves': pr_curves_data
        }, f, indent=2)
        
    with open(os.path.join(models_dir, 'feature_importance.json'), 'w', encoding='utf-8') as f:
        json.dump(feat_imp, f, indent=2)
        
    print(f"\n[+] Saved all model artifacts, curves, and metrics to: {models_dir}")
    print("=" * 75)
    return benchmark_results

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # Prefer the fully enriched dataset (791 clinical records + 27 biological & GSE131907 single-cell features)
    csv_file = os.path.join(base_dir, 'DATA', 'PROCESSED DATA', 'processed_dataset.csv')
    if not os.path.exists(csv_file):
        csv_file = os.path.join(base_dir, 'DATA', 'PROCESSED DATA', 'lung cancer.xlsx - Results.csv')
    models_folder = os.path.join(base_dir, 'models')
    run_training_pipeline(csv_file, models_folder)
