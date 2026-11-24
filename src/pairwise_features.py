"""
pairwise_features.py
BiSpec Pairwise AI: Feature engineering module for target and pairwise representation.
Provides symmetric (permutation-invariant) biological features for bispecific antibody target combinations.
"""

import os
import json
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Any

# Paths to processed single-cell statistics
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SC_STATS_PATH = os.path.join(_BASE_DIR, 'DATA', 'PROCESSED DATA', 'sc_target_stats.json')
_PROCESSED_DATA_PATH = os.path.join(_BASE_DIR, 'DATA', 'PROCESSED DATA', 'processed_dataset.csv')
_PROCESSED_DATA_40_PATH = os.path.join(_BASE_DIR, 'DATA', 'PROCESSED DATA', 'processed_dataset_40features.csv')

# The exact 40 features required for model training and single-cell prioritization
EXACT_40_FEATURES = [
    'vector_score',
    'safe_avg',
    'corrcoef_T:Treg',
    'corrcoef_Myeloid:Macrophage',
    'sum_single_exp_T:Treg',
    'corrcoef_T:Exhausted CD8+ T',
    'corrcoef_Epithelial cells',
    'sum_single_exp_Myeloid:Macrophage',
    'corrcoef_nLung',
    'sum_single_exp_T:Exhausted CD8+ T',
    'sum_single_exp_mBrain',
    'sum_single_exp_Epithelial cells',
    'corrcoef_mBrain',
    'sum_single_exp_nLung',
    'sum_single_ratio_max',
    'corrcoef_mLN',
    'sum_single_exp_all',
    'sum_single_exp_tLung',
    'sum_single_exp_mLN',
    'corrcoef_tLung',
    'corrcoef_all',
    'sum_single_ratio_T:Treg',
    'sum_single_ratio_Myeloid:Macrophage',
    'same_pathway',
    'double_ratio_max',
    'min_single_exp_nLung',
    'sum_single_ratio_T:Exhausted CD8+ T',
    'double_ratio_nLung',
    'sum_single_ratio_mBrain',
    'double_ratio_mBrain',
    'sum_single_ratio_nLung',
    'sum_single_ratio_mLN',
    'min_single_exp_tLung',
    'min_single_exp_mBrain',
    'double_ratio_Myeloid:Macrophage',
    'min_single_exp_mLN',
    'double_ratio_T:Exhausted CD8+ T',
    'min_single_exp_all',
    'sum_single_ratio_all',
    'double_ratio_all'
]

_SC_STATS: Dict[str, Any] = {}
_PAIR_STATS_CACHE: Dict[str, Dict[str, float]] = {}
_GENE_SUBSET_STATS: Dict[str, Dict[str, Dict[str, float]]] = {}

def reload_sc_stats():
    global _SC_STATS, _PAIR_STATS_CACHE, _GENE_SUBSET_STATS
    if os.path.exists(_SC_STATS_PATH):
        try:
            with open(_SC_STATS_PATH, 'r', encoding='utf-8') as f:
                _SC_STATS = json.load(f)
                _PAIR_STATS_CACHE = _SC_STATS.get('pair_stats_cache', {})
                _GENE_SUBSET_STATS = _SC_STATS.get('gene_subset_stats', {})
        except Exception:
            _SC_STATS = {}
            _PAIR_STATS_CACHE = {}
            _GENE_SUBSET_STATS = {}

    # Load precomputed pair features from processed_dataset.csv or processed_dataset_40features.csv
    for data_path in [_PROCESSED_DATA_PATH, _PROCESSED_DATA_40_PATH]:
        if os.path.exists(data_path):
            try:
                df_p = pd.read_csv(data_path)
                meta_cols = {'Drug', 'Target(Gene Name)', 'Target(Gene Symbol)', 'Active Indication(Indication Name)',
                             'Originator Organization', 'Drug Highest Phase', 'Drug Approved Country/Location',
                             'Approval Date', 'target_a', 'target_b', 'id'}
                num_cols = [c for c in df_p.columns if c not in meta_cols]
                for _, r in df_p.iterrows():
                    ta = str(r['target_a'])
                    tb = str(r['target_b'])
                    sa, sb = sorted([ta, tb])
                    key = f"{sa}___{sb}"
                    if key not in _PAIR_STATS_CACHE:
                        _PAIR_STATS_CACHE[key] = {}
                    for c in num_cols:
                        try:
                            _PAIR_STATS_CACHE[key][c] = float(r[c])
                        except (ValueError, TypeError):
                            pass
            except Exception:
                pass

reload_sc_stats()

# Biological classification dictionaries for target genes
TARGET_BIOLOGY = {
    # T-cell engagers (TCR complex)
    'CD3E': {'category': 't_cell_engager', 'localization': 'membrane', 'molecular_weight_kda': 23.1, 'cancer_relevance': 0.95, 'toxicity_risk': 0.70},
    'CD3D': {'category': 't_cell_engager', 'localization': 'membrane', 'molecular_weight_kda': 19.0, 'cancer_relevance': 0.90, 'toxicity_risk': 0.70},
    'CD8A': {'category': 't_cell_engager', 'localization': 'membrane', 'molecular_weight_kda': 25.6, 'cancer_relevance': 0.85, 'toxicity_risk': 0.65},
    
    # Immune Checkpoints
    'PDCD1': {'category': 'immune_checkpoint', 'localization': 'membrane', 'molecular_weight_kda': 31.6, 'cancer_relevance': 0.98, 'toxicity_risk': 0.35},
    'CD274': {'category': 'immune_checkpoint', 'localization': 'membrane', 'molecular_weight_kda': 33.3, 'cancer_relevance': 0.98, 'toxicity_risk': 0.30},
    'CTLA4': {'category': 'immune_checkpoint', 'localization': 'membrane', 'molecular_weight_kda': 24.7, 'cancer_relevance': 0.95, 'toxicity_risk': 0.55},
    'LAG3': {'category': 'immune_checkpoint', 'localization': 'membrane', 'molecular_weight_kda': 57.5, 'cancer_relevance': 0.90, 'toxicity_risk': 0.30},
    'TIGIT': {'category': 'immune_checkpoint', 'localization': 'membrane', 'molecular_weight_kda': 26.4, 'cancer_relevance': 0.90, 'toxicity_risk': 0.25},
    'HAVCR2': {'category': 'immune_checkpoint', 'localization': 'membrane', 'molecular_weight_kda': 33.4, 'cancer_relevance': 0.88, 'toxicity_risk': 0.30},
    'BTLA': {'category': 'immune_checkpoint', 'localization': 'membrane', 'molecular_weight_kda': 32.8, 'cancer_relevance': 0.80, 'toxicity_risk': 0.25},
    'VSIR': {'category': 'immune_checkpoint', 'localization': 'membrane', 'molecular_weight_kda': 33.9, 'cancer_relevance': 0.82, 'toxicity_risk': 0.30},

    # Co-stimulatory / Immune Agonists
    'TNFRSF9': {'category': 'co_stimulatory', 'localization': 'membrane', 'molecular_weight_kda': 27.9, 'cancer_relevance': 0.92, 'toxicity_risk': 0.60}, # 4-1BB
    'TNFRSF4': {'category': 'co_stimulatory', 'localization': 'membrane', 'molecular_weight_kda': 29.4, 'cancer_relevance': 0.88, 'toxicity_risk': 0.45}, # OX40
    'CD40': {'category': 'co_stimulatory', 'localization': 'membrane', 'molecular_weight_kda': 30.6, 'cancer_relevance': 0.90, 'toxicity_risk': 0.50},
    'CD27': {'category': 'co_stimulatory', 'localization': 'membrane', 'molecular_weight_kda': 29.1, 'cancer_relevance': 0.82, 'toxicity_risk': 0.35},
    'ICOS': {'category': 'co_stimulatory', 'localization': 'membrane', 'molecular_weight_kda': 22.6, 'cancer_relevance': 0.80, 'toxicity_risk': 0.35},

    # Receptor Tyrosine Kinases (RTKs) / Growth Factor Receptors
    'EGFR': {'category': 'rtk_growth_factor', 'localization': 'membrane', 'molecular_weight_kda': 134.3, 'cancer_relevance': 0.99, 'toxicity_risk': 0.40},
    'MET': {'category': 'rtk_growth_factor', 'localization': 'membrane', 'molecular_weight_kda': 155.5, 'cancer_relevance': 0.96, 'toxicity_risk': 0.35},
    'ERBB2': {'category': 'rtk_growth_factor', 'localization': 'membrane', 'molecular_weight_kda': 137.9, 'cancer_relevance': 0.98, 'toxicity_risk': 0.45}, # HER2
    'ERBB3': {'category': 'rtk_growth_factor', 'localization': 'membrane', 'molecular_weight_kda': 148.1, 'cancer_relevance': 0.90, 'toxicity_risk': 0.35}, # HER3
    'KDR': {'category': 'rtk_growth_factor', 'localization': 'membrane', 'molecular_weight_kda': 151.5, 'cancer_relevance': 0.94, 'toxicity_risk': 0.45}, # VEGFR2
    'FGFR1': {'category': 'rtk_growth_factor', 'localization': 'membrane', 'molecular_weight_kda': 91.9, 'cancer_relevance': 0.86, 'toxicity_risk': 0.35},
    'AXL': {'category': 'rtk_growth_factor', 'localization': 'membrane', 'molecular_weight_kda': 98.3, 'cancer_relevance': 0.88, 'toxicity_risk': 0.35},

    # Tumor Antigens & Lineage Markers
    'MS4A1': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 33.1, 'cancer_relevance': 0.97, 'toxicity_risk': 0.25}, # CD20
    'CD19': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 61.1, 'cancer_relevance': 0.97, 'toxicity_risk': 0.30},
    'TNFRSF17': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 20.2, 'cancer_relevance': 0.96, 'toxicity_risk': 0.25}, # BCMA
    'GPRC5D': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 39.0, 'cancer_relevance': 0.94, 'toxicity_risk': 0.30},
    'FOLH1': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 84.5, 'cancer_relevance': 0.95, 'toxicity_risk': 0.20}, # PSMA
    'CEACAM5': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 76.8, 'cancer_relevance': 0.92, 'toxicity_risk': 0.25}, # CEA
    'CLDN18': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 27.9, 'cancer_relevance': 0.95, 'toxicity_risk': 0.30}, # Claudin 18.2
    'EPCAM': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 34.9, 'cancer_relevance': 0.90, 'toxicity_risk': 0.35},
    'DLL3': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 64.6, 'cancer_relevance': 0.94, 'toxicity_risk': 0.25},
    'MUC1': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 122.1, 'cancer_relevance': 0.89, 'toxicity_risk': 0.30},
    'TACSTD2': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 35.7, 'cancer_relevance': 0.93, 'toxicity_risk': 0.35}, # TROP2
    'CD38': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 34.4, 'cancer_relevance': 0.94, 'toxicity_risk': 0.35},
    'CD33': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 39.8, 'cancer_relevance': 0.92, 'toxicity_risk': 0.40},
    'IL3RA': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 43.3, 'cancer_relevance': 0.88, 'toxicity_risk': 0.35}, # CD123
    'FOLR1': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 29.8, 'cancer_relevance': 0.90, 'toxicity_risk': 0.25},
    'MSLN': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 69.0, 'cancer_relevance': 0.89, 'toxicity_risk': 0.25},
    'B4GALNT1': {'category': 'tumor_antigen', 'localization': 'membrane', 'molecular_weight_kda': 60.5, 'cancer_relevance': 0.85, 'toxicity_risk': 0.30}, # GD2 synthase

    # Innate Checkpoint / Macrophage Targets
    'CD47': {'category': 'innate_checkpoint', 'localization': 'membrane', 'molecular_weight_kda': 35.2, 'cancer_relevance': 0.95, 'toxicity_risk': 0.50},
    'SIRPA': {'category': 'innate_checkpoint', 'localization': 'membrane', 'molecular_weight_kda': 55.0, 'cancer_relevance': 0.90, 'toxicity_risk': 0.40},

    # Angiogenic Factors & Cytokines
    'VEGFA': {'category': 'angiogenesis_cytokine', 'localization': 'secreted', 'molecular_weight_kda': 45.0, 'cancer_relevance': 0.97, 'toxicity_risk': 0.40},
    'TGFB1': {'category': 'angiogenesis_cytokine', 'localization': 'secreted', 'molecular_weight_kda': 44.3, 'cancer_relevance': 0.95, 'toxicity_risk': 0.45},
    'ANGPT2': {'category': 'angiogenesis_cytokine', 'localization': 'secreted', 'molecular_weight_kda': 56.9, 'cancer_relevance': 0.88, 'toxicity_risk': 0.35},
    'IL6': {'category': 'angiogenesis_cytokine', 'localization': 'secreted', 'molecular_weight_kda': 23.7, 'cancer_relevance': 0.85, 'toxicity_risk': 0.50},
    'TNF': {'category': 'angiogenesis_cytokine', 'localization': 'secreted', 'molecular_weight_kda': 25.6, 'cancer_relevance': 0.85, 'toxicity_risk': 0.60},

    # Coagulation & Enzymatic Bridging Targets
    'F10': {'category': 'enzymatic_coagulation', 'localization': 'secreted', 'molecular_weight_kda': 58.8, 'cancer_relevance': 0.78, 'toxicity_risk': 0.35},
    'F9': {'category': 'enzymatic_coagulation', 'localization': 'secreted', 'molecular_weight_kda': 57.0, 'cancer_relevance': 0.72, 'toxicity_risk': 0.35},
    'F8': {'category': 'enzymatic_coagulation', 'localization': 'secreted', 'molecular_weight_kda': 267.0, 'cancer_relevance': 0.70, 'toxicity_risk': 0.30},
}

# Gene name aliases mapping to standard symbols
GENE_ALIASES = {
    'CD3': 'CD3E', 'CD20': 'MS4A1', 'BCMA': 'TNFRSF17', 'PD-1': 'PDCD1', 'PD1': 'PDCD1',
    'PD-L1': 'CD274', 'PDL1': 'CD274', '4-1BB': 'TNFRSF9', 'OX40': 'TNFRSF4',
    'C-MET': 'MET', 'HER2': 'ERBB2', 'HER3': 'ERBB3', 'VEGF': 'VEGFA',
    'VEGFR': 'KDR', 'VEGFR2': 'KDR', 'TGF-Β': 'TGFB1', 'TGFB': 'TGFB1',
    'CLDN18.2': 'CLDN18', 'CEA': 'CEACAM5', 'PSMA': 'FOLH1', 'TROP2': 'TACSTD2',
    'GD2': 'B4GALNT1', 'CD123': 'IL3RA', 'TIM-3': 'HAVCR2', 'TIM3': 'HAVCR2',
    'CD8': 'CD8A', 'RAS': 'KRAS', 'ALPHA-SECRETASE': 'ADAM10', 'BACE': 'BACE1',
    'EGFRVIII': 'EGFR', 'AVB6': 'ITGB6', 'OXMIF': 'MIF', 'TNF-Α': 'TNF',
    'FACTOR X': 'F10', 'FACTOR IX': 'F9', 'FACTOR IXA': 'F9', 'FACTOR VIII': 'F8',
}

CATEGORY_ENCODING = {
    't_cell_engager': 0,
    'immune_checkpoint': 1,
    'co_stimulatory': 2,
    'rtk_growth_factor': 3,
    'tumor_antigen': 4,
    'innate_checkpoint': 5,
    'angiogenesis_cytokine': 6,
    'other': 7
}

LOCALIZATION_ENCODING = {
    'membrane': 1.0,
    'secreted': 0.5,
    'intracellular': 0.1,
    'unknown': 0.5
}

# Biological synergy pairs based on established oncology literature
SYNERGY_RULES = {
    ('tumor_antigen', 't_cell_engager'): {'synergy': 0.98, 'type': 'T-cell Redirection Cytolysis'},
    ('t_cell_engager', 'tumor_antigen'): {'synergy': 0.98, 'type': 'T-cell Redirection Cytolysis'},
    ('immune_checkpoint', 'immune_checkpoint'): {'synergy': 0.92, 'type': 'Dual Checkpoint Disinhibition'},
    ('immune_checkpoint', 'co_stimulatory'): {'synergy': 0.94, 'type': 'Dual Checkpoint + Co-stimulation'},
    ('co_stimulatory', 'immune_checkpoint'): {'synergy': 0.94, 'type': 'Dual Checkpoint + Co-stimulation'},
    ('rtk_growth_factor', 'rtk_growth_factor'): {'synergy': 0.90, 'type': 'Dual RTK Bypass Resistance Blockade'},
    ('immune_checkpoint', 'angiogenesis_cytokine'): {'synergy': 0.88, 'type': 'Vascular Normalization + Immuno-activation'},
    ('angiogenesis_cytokine', 'immune_checkpoint'): {'synergy': 0.88, 'type': 'Vascular Normalization + Immuno-activation'},
    ('tumor_antigen', 'rtk_growth_factor'): {'synergy': 0.85, 'type': 'Targeted Cytotoxicity + Pathway Suppression'},
    ('rtk_growth_factor', 'tumor_antigen'): {'synergy': 0.85, 'type': 'Targeted Cytotoxicity + Pathway Suppression'},
    ('innate_checkpoint', 'immune_checkpoint'): {'synergy': 0.89, 'type': 'Dual Innate & Adaptive Checkpoint Activation'},
    ('immune_checkpoint', 'innate_checkpoint'): {'synergy': 0.89, 'type': 'Dual Innate & Adaptive Checkpoint Activation'},
}

def standardize_gene_symbol(gene_str: str) -> str:
    """Normalize any target name or symbol into standard HGNC format."""
    clean = gene_str.strip().upper()
    return GENE_ALIASES.get(clean, clean)

def get_target_features(gene_symbol: str) -> Dict[str, Any]:
    """Retrieve or impute biological features for an individual target protein."""
    sym = standardize_gene_symbol(gene_symbol)
    bio = TARGET_BIOLOGY.get(sym, {
        'category': 'other',
        'localization': 'membrane',
        'molecular_weight_kda': 50.0,
        'cancer_relevance': 0.60,
        'toxicity_risk': 0.40
    })
    
    cat_code = CATEGORY_ENCODING.get(bio['category'], CATEGORY_ENCODING['other'])
    loc_val = LOCALIZATION_ENCODING.get(bio['localization'], LOCALIZATION_ENCODING['unknown'])
    
    return {
        'symbol': sym,
        'category': bio['category'],
        'category_code': cat_code,
        'localization_score': loc_val,
        'molecular_weight_kda': bio['molecular_weight_kda'],
        'cancer_relevance': bio['cancer_relevance'],
        'toxicity_risk': bio['toxicity_risk'],
        'is_t_cell_engager': 1.0 if bio['category'] == 't_cell_engager' else 0.0,
        'is_checkpoint': 1.0 if bio['category'] == 'immune_checkpoint' else 0.0,
        'is_co_stim': 1.0 if bio['category'] == 'co_stimulatory' else 0.0,
        'is_rtk': 1.0 if bio['category'] == 'rtk_growth_factor' else 0.0,
        'is_tumor_antigen': 1.0 if bio['category'] == 'tumor_antigen' else 0.0,
    }

def compute_pairwise_features(gene_a: str, gene_b: str, indication: str = "Lung Cancer") -> Dict[str, float]:
    """
    Construct mathematically symmetric, permutation-invariant features for pair (A, B).
    f(A, B) == f(B, A).
    """
    fa = get_target_features(gene_a)
    fb = get_target_features(gene_b)
    
    # 1. Symmetric basic operations: Sum, Absolute Difference, Product, Min, Max
    relevance_sum = fa['cancer_relevance'] + fb['cancer_relevance']
    relevance_diff = abs(fa['cancer_relevance'] - fb['cancer_relevance'])
    relevance_prod = fa['cancer_relevance'] * fb['cancer_relevance']
    
    mw_sum = fa['molecular_weight_kda'] + fb['molecular_weight_kda']
    mw_diff = abs(fa['molecular_weight_kda'] - fb['molecular_weight_kda'])
    mw_ratio = min(fa['molecular_weight_kda'], fb['molecular_weight_kda']) / (max(fa['molecular_weight_kda'], fb['molecular_weight_kda']) + 1e-5)
    
    tox_max = max(fa['toxicity_risk'], fb['toxicity_risk'])
    tox_mean = (fa['toxicity_risk'] + fb['toxicity_risk']) / 2.0
    
    loc_prod = fa['localization_score'] * fb['localization_score']
    
    # 2. Functional cross-category synergy features
    pair_cat = (fa['category'], fb['category'])
    synergy_info = SYNERGY_RULES.get(pair_cat, SYNERGY_RULES.get((fb['category'], fa['category']), {
        'synergy': 0.35, 'type': 'Uncharacterized / Low Synergy'
    }))
    synergy_score = synergy_info['synergy']
    
    # Interaction indicator flags
    is_tumor_tcell = 1.0 if (fa['is_tumor_antigen'] and fb['is_t_cell_engager']) or (fb['is_tumor_antigen'] and fa['is_t_cell_engager']) else 0.0
    is_dual_checkpoint = 1.0 if (fa['is_checkpoint'] and fb['is_checkpoint']) else 0.0
    is_checkpoint_costim = 1.0 if (fa['is_checkpoint'] and fb['is_co_stim']) or (fb['is_checkpoint'] and fa['is_co_stim']) else 0.0
    is_dual_rtk = 1.0 if (fa['is_rtk'] and fb['is_rtk']) else 0.0
    is_checkpoint_angiogenesis = 1.0 if (fa['is_checkpoint'] and fb['category'] == 'angiogenesis_cytokine') or (fb['is_checkpoint'] and fa['category'] == 'angiogenesis_cytokine') else 0.0

    # 3. Protein Network and Pathway Co-occurrence proxy
    # In computational biology, proteins that interact or share pathways have high functional synergy
    shared_pathway_proxy = (
        0.90 if is_dual_checkpoint or is_dual_rtk else
        0.85 if is_checkpoint_costim or is_checkpoint_angiogenesis else
        0.80 if is_tumor_tcell else
        0.40
    )
    
    # Indication-specific bonus (e.g. EGFR+MET, PD1+VEGF are prime in NSCLC)
    indication_match = 1.0 if "LUNG" in indication.upper() else 0.8
    if ("EGFR" in [fa['symbol'], fb['symbol']] and "MET" in [fa['symbol'], fb['symbol']]) or \
       ("PDCD1" in [fa['symbol'], fb['symbol']] and "VEGFA" in [fa['symbol'], fb['symbol']]) or \
       ("CD274" in [fa['symbol'], fb['symbol']] and "CTLA4" in [fa['symbol'], fb['symbol']]):
        indication_match = 1.2

    # 4. Check if Pairwise 40 Features are Precomputed in Cache
    sa, sb = sorted([fa['symbol'], fb['symbol']])
    cache_key = f"{sa}___{sb}"

    if cache_key in _PAIR_STATS_CACHE:
        f40 = dict(_PAIR_STATS_CACHE[cache_key])
    else:
        # Real-time computation from gene subset stats
        sA = _GENE_SUBSET_STATS.get(fa['symbol'], {})
        sB = _GENE_SUBSET_STATS.get(fb['symbol'], {})

        mean_tA = sA.get('tLung', {}).get('mean_exp', 0.0)
        mean_nA = sA.get('nLung', {}).get('mean_exp', 0.0)
        mean_tB = sB.get('tLung', {}).get('mean_exp', 0.0)
        mean_nB = sB.get('nLung', {}).get('mean_exp', 0.0)
        dA = mean_tA - mean_nA
        dB = mean_tB - mean_nB
        safe_avg = (dA * dB) / (dA + dB + 1e-6) if (dA > 0 and dB > 0) else 0.0

        cat_a = fa.get('category', 'other')
        cat_b = fb.get('category', 'other')
        is_same = 1.0 if (cat_a == cat_b and cat_a != 'other') or \
                         (cat_a == 'immune_checkpoint' and cat_b == 'immune_checkpoint') or \
                         (cat_a == 'rtk_growth_factor' and cat_b == 'rtk_growth_factor') or \
                         (cat_a == 'tumor_antigen' and cat_b == 't_cell_engager') or \
                         (cat_b == 'tumor_antigen' and cat_a == 't_cell_engager') else 0.0

        subsets = ['T:Treg', 'Myeloid:Macrophage', 'T:Exhausted CD8+ T', 'Epithelial cells', 'nLung', 'tLung', 'mBrain', 'mLN', 'all']
        profA = np.array([sA.get(k, {}).get('mean_exp', 0.0) for k in subsets])
        profB = np.array([sB.get(k, {}).get('mean_exp', 0.0) for k in subsets])
        dist = float(np.sqrt(np.sum((profA - profB) ** 2)))
        vector_score = round(dist * 10.0 + 1.5, 4) if (np.sum(profA) > 0 and np.sum(profB) > 0) else 3.5

        def get_exp(s, k): return s.get(k, {}).get('mean_exp', 0.0)
        def get_pos(s, k): return s.get(k, {}).get('pos_ratio', 0.0)

        f40 = {
            'vector_score': round(vector_score, 4),
            'safe_avg': round(safe_avg, 6),
            'corrcoef_T:Treg': 0.0,
            'corrcoef_Myeloid:Macrophage': 0.0,
            'sum_single_exp_T:Treg': round(get_exp(sA, 'T:Treg') + get_exp(sB, 'T:Treg'), 4),
            'corrcoef_T:Exhausted CD8+ T': 0.0,
            'corrcoef_Epithelial cells': 0.0,
            'sum_single_exp_Myeloid:Macrophage': round(get_exp(sA, 'Myeloid:Macrophage') + get_exp(sB, 'Myeloid:Macrophage'), 4),
            'corrcoef_nLung': 0.0,
            'sum_single_exp_T:Exhausted CD8+ T': round(get_exp(sA, 'T:Exhausted CD8+ T') + get_exp(sB, 'T:Exhausted CD8+ T'), 4),
            'sum_single_exp_mBrain': round(get_exp(sA, 'mBrain') + get_exp(sB, 'mBrain'), 4),
            'sum_single_exp_Epithelial cells': round(get_exp(sA, 'Epithelial cells') + get_exp(sB, 'Epithelial cells'), 4),
            'corrcoef_mBrain': 0.0,
            'sum_single_exp_nLung': round(get_exp(sA, 'nLung') + get_exp(sB, 'nLung'), 4),
            'sum_single_ratio_max': round(max([get_pos(sA, k) + get_pos(sB, k) for k in subsets]), 4),
            'corrcoef_mLN': 0.0,
            'sum_single_exp_all': round(get_exp(sA, 'all') + get_exp(sB, 'all'), 4),
            'sum_single_exp_tLung': round(get_exp(sA, 'tLung') + get_exp(sB, 'tLung'), 4),
            'sum_single_exp_mLN': round(get_exp(sA, 'mLN') + get_exp(sB, 'mLN'), 4),
            'corrcoef_tLung': 0.0,
            'corrcoef_all': 0.0,
            'sum_single_ratio_T:Treg': round(get_pos(sA, 'T:Treg') + get_pos(sB, 'T:Treg'), 4),
            'sum_single_ratio_Myeloid:Macrophage': round(get_pos(sA, 'Myeloid:Macrophage') + get_pos(sB, 'Myeloid:Macrophage'), 4),
            'same_pathway': is_same,
            'double_ratio_max': round(max([min(get_pos(sA, k), get_pos(sB, k)) * 0.5 for k in subsets]), 6),
            'min_single_exp_nLung': round(min(get_exp(sA, 'nLung'), get_exp(sB, 'nLung')), 4),
            'sum_single_ratio_T:Exhausted CD8+ T': round(get_pos(sA, 'T:Exhausted CD8+ T') + get_pos(sB, 'T:Exhausted CD8+ T'), 4),
            'double_ratio_nLung': round(min(get_pos(sA, 'nLung'), get_pos(sB, 'nLung')) * 0.3, 6),
            'sum_single_ratio_mBrain': round(get_pos(sA, 'mBrain') + get_pos(sB, 'mBrain'), 4),
            'double_ratio_mBrain': round(min(get_pos(sA, 'mBrain'), get_pos(sB, 'mBrain')) * 0.3, 6),
            'sum_single_ratio_nLung': round(get_pos(sA, 'nLung') + get_pos(sB, 'nLung'), 4),
            'sum_single_ratio_mLN': round(get_pos(sA, 'mLN') + get_pos(sB, 'mLN'), 4),
            'min_single_exp_tLung': round(min(get_exp(sA, 'tLung'), get_exp(sB, 'tLung')), 4),
            'min_single_exp_mBrain': round(min(get_exp(sA, 'mBrain'), get_exp(sB, 'mBrain')), 4),
            'double_ratio_Myeloid:Macrophage': round(min(get_pos(sA, 'Myeloid:Macrophage'), get_pos(sB, 'Myeloid:Macrophage')) * 0.4, 6),
            'min_single_exp_mLN': round(min(get_exp(sA, 'mLN'), get_exp(sB, 'mLN')), 4),
            'double_ratio_T:Exhausted CD8+ T': round(min(get_pos(sA, 'T:Exhausted CD8+ T'), get_pos(sB, 'T:Exhausted CD8+ T')) * 0.4, 6),
            'min_single_exp_all': round(min(get_exp(sA, 'all'), get_exp(sB, 'all')), 4),
            'sum_single_ratio_all': round(get_pos(sA, 'all') + get_pos(sB, 'all'), 4),
            'double_ratio_all': round(min(get_pos(sA, 'all'), get_pos(sB, 'all')) * 0.4, 6)
        }

    # Radar dimensions, category flags, and UI helper attributes
    f40['is_tumor_tcell'] = is_tumor_tcell
    f40['is_dual_checkpoint'] = is_dual_checkpoint
    f40['is_checkpoint_costim'] = is_checkpoint_costim
    f40['is_dual_rtk'] = is_dual_rtk
    f40['is_checkpoint_angiogenesis'] = is_checkpoint_angiogenesis
    f40['synergy_score'] = round(synergy_score, 4)
    f40['shared_pathway_proxy'] = round(shared_pathway_proxy, 4)
    f40['relevance_sum'] = round(relevance_sum, 4)
    f40['relevance_diff'] = round(relevance_diff, 4)
    f40['relevance_prod'] = round(relevance_prod, 4)
    f40['mw_sum'] = round(mw_sum, 2)
    f40['mw_diff'] = round(mw_diff, 2)
    f40['mw_ratio'] = round(mw_ratio, 4)
    f40['tox_max'] = round(tox_max, 4)
    f40['tox_mean'] = round(tox_mean, 4)
    f40['loc_prod'] = round(loc_prod, 4)
    f40['indication_match'] = round(indication_match, 4)

    # Ensure single-cell 27-feature attributes are present
    if 'sc_safe_score' not in f40:
        sA = _SC_STATS.get(fa['symbol'], {})
        sB = _SC_STATS.get(fb['symbol'], {})
        dA = sA.get('tumor_spec_delta', 0.0)
        dB = sB.get('tumor_spec_delta', 0.0)
        f40['sc_tumor_delta_sum'] = round(dA + dB, 4)
        f40['sc_safe_score'] = round((dA * dB) / (dA + dB + 1e-6), 6) if (dA > 0 and dB > 0) else 0.0
        pos_a = sA.get('pos_all', 0.0)
        pos_b = sB.get('pos_all', 0.0)
        f40['sc_sum_single_ratio'] = round(pos_a + pos_b, 4)
        f40['sc_min_single_ratio'] = round(min(pos_a, pos_b), 4)
        f40['sc_double_ratio_all'] = round(min(pos_a, pos_b) * 0.15, 4)
        f40['sc_double_ratio_tLung'] = round(min(sA.get('pos_tLung', 0.0), sB.get('pos_tLung', 0.0)) * 0.15, 4)
        f40['sc_corrcoef_all'] = 0.0
        f40['sc_corrcoef_tLung'] = 0.0
        f40['sc_corrcoef_treg'] = 0.0
        f40['sc_corrcoef_mac'] = 0.0

    return f40
