"""
data_processor.py
BiSpec Pairwise AI: Data extraction, cleaning, negative sampling, and pairwise dataset construction.
Processes the clinical bispecific antibody dataset and produces the structured ML-ready dataset.
"""

import os
import sys
import re
import json
import itertools
import random
import pandas as pd
import numpy as np
from typing import List, Tuple, Set, Dict

# Ensure src directory is in path
sys.path.append(os.path.dirname(__file__))
from pairwise_features import (
    standardize_gene_symbol,
    compute_pairwise_features,
    get_target_features,
    TARGET_BIOLOGY,
    GENE_ALIASES
)

# Custom mapping for target names where symbol is '-'
MANUAL_NAME_TO_SYMBOLS = {
    'CD3 + CLDN18.2': ('CD3E', 'CLDN18'),
    'CD3 + CEA': ('CD3E', 'CEACAM5'),
    'TGF-Β + VEGF': ('TGFB1', 'VEGFA'),
    'TGF-B + VEGF': ('TGFB1', 'VEGFA'),
    'CD3 + GD2': ('CD3E', 'B4GALNT1'),
    'CD3 + RAS': ('CD3E', 'KRAS'),
    'CEA + DTPA': ('CEACAM5', 'DTPA'),
    'PDGFR + VEGFR': ('PDGFRB', 'KDR'),
    'CD8 + CLDN18.2': ('CD8A', 'CLDN18'),
    'CD3 + OXMIF': ('CD3E', 'MIF'),
    'TGF-Β + ΑVΒ6': ('TGFB1', 'ITGB6'),
    'TGF-B + AVB6': ('TGFB1', 'ITGB6'),
    'IL-12 + IL-23': ('IL12A', 'IL23A'),
    'IL-17 + TNF-Α': ('IL17A', 'TNF'),
    'IL-17 + TNF-A': ('IL17A', 'TNF'),
    'CD3 + EGFRVIII': ('CD3E', 'EGFR'),
    'CD3 + HLA CLASS II ANTIGEN': ('CD3E', 'HLA-DRA'),
    'CD3 + HEME OXYGENASE': ('CD3E', 'HMOX1'),
    'BACE + Α-SECRETASE': ('BACE1', 'ADAM10'),
    'BACE + A-SECRETASE': ('BACE1', 'ADAM10'),
    'GROWTH FACTOR RECEPTOR': ('EGFR', 'MET')
}

def clean_target_pair(row: pd.Series) -> Tuple[str, str]:
    """Extract standard (Target_A, Target_B) gene symbols from row."""
    sym_val = str(row['Target(Gene Symbol)']).strip()
    name_val = str(row['Target(Gene Name)']).strip().upper()
    
    # Check if symbol is missing or hyphen
    if sym_val in ['-', '', 'nan', 'None']:
        if name_val in MANUAL_NAME_TO_SYMBOLS:
            g1, g2 = MANUAL_NAME_TO_SYMBOLS[name_val]
            return tuple(sorted([standardize_gene_symbol(g1), standardize_gene_symbol(g2)]))
        # Try to parse from name
        parts = [p.strip() for p in re.split(r'[,+/;]', name_val) if p.strip()]
        if len(parts) >= 2:
            g1 = standardize_gene_symbol(parts[0])
            g2 = standardize_gene_symbol(parts[1])
            return tuple(sorted([g1, g2]))
        elif len(parts) == 1:
            g1 = standardize_gene_symbol(parts[0])
            return (g1, g1)
        return ('UNKNOWN_A', 'UNKNOWN_B')
    
    # Split symbol string
    symbols = [standardize_gene_symbol(p) for p in re.split(r'[,+/;]', sym_val) if p.strip()]
    if len(symbols) >= 2:
        return tuple(sorted([symbols[0], symbols[1]]))
    elif len(symbols) == 1:
        return (symbols[0], symbols[0])
    return ('UNKNOWN_A', 'UNKNOWN_B')

def get_clinical_tier(phase_str: str) -> int:
    """Map drug highest phase to clinical maturity tier."""
    p = str(phase_str).upper()
    if 'APPROVED' in p or 'BLA' in p or 'NDA' in p:
        return 4
    elif 'PHASE 3' in p or 'PHASE 2/3' in p:
        return 3
    elif 'PHASE 2' in p or 'PHASE 1' in p:
        return 2
    elif 'PRECLINICAL' in p or 'IND' in p:
        return 1
    return 0

def build_datasets(raw_csv_path: str, output_dir: str):
    """Clean the raw CSV, extract positive pairs, sample negative pairs, compute features."""
    print("=" * 70)
    print("BiSpec Pairwise AI - Phase 1: Data Preprocessing & Pairwise Feature Engine")
    print("=" * 70)
    
    if not os.path.exists(raw_csv_path):
        raise FileNotFoundError(f"Source file not found at: {raw_csv_path}")
        
    df = pd.read_csv(raw_csv_path)
    print(f"[*] Loaded raw clinical bispecific dataset: {len(df)} records.")
    
    # Standardize pairs
    df[['target_a', 'target_b']] = df.apply(clean_target_pair, axis=1, result_type='expand')
    df['clinical_tier'] = df['Drug Highest Phase'].apply(get_clinical_tier)
    
    # Filter valid target pairs (exclude unknown or single self-pairs)
    valid_mask = (df['target_a'] != 'UNKNOWN_A') & (df['target_a'] != df['target_b'])
    df_valid = df[valid_mask].copy()
    print(f"[*] Filtered valid dual-target records: {len(df_valid)} records.")
    
    # Save cleaned clinical target records
    cleaned_file = os.path.join(output_dir, 'cleaned_bispecific_targets.csv')
    df_valid.to_csv(cleaned_file, index=False)
    print(f"[+] Saved cleaned clinical targets to: {cleaned_file}")
    
    # Group by unique target pairs
    positive_pairs_agg = df_valid.groupby(['target_a', 'target_b']).agg(
        num_drugs=('Drug', 'count'),
        max_tier=('clinical_tier', 'max'),
        drug_names=('Drug', lambda x: ', '.join(x.unique()[:3])),
        indications=('Active Indication(Indication Name)', lambda x: ' | '.join(x.dropna().unique()[:2]))
    ).reset_index()
    
    positive_pairs_agg['label'] = 1
    print(f"[*] Identified {len(positive_pairs_agg)} unique positive clinical target pairs.")
    
    # Collect all unique target genes
    all_genes = sorted(list(set(df_valid['target_a']).union(set(df_valid['target_b']))))
    print(f"[*] Total unique biological target genes identified: {len(all_genes)}")
    
    # Generate negative pairs (controlled biological negative sampling)
    existing_pairs_set: Set[Tuple[str, str]] = set()
    for _, r in positive_pairs_agg.iterrows():
        existing_pairs_set.add((r['target_a'], r['target_b']))
        existing_pairs_set.add((r['target_b'], r['target_a']))
        
    # Generate candidate unobserved pairs
    all_possible_pairs = list(itertools.combinations(all_genes, 2))
    unobserved_pairs = [p for p in all_possible_pairs if p not in existing_pairs_set]
    
    # Sample negative pairs with matching or controlled ratio (~ 1.2x positive pairs)
    random.seed(42)
    num_negatives = int(len(positive_pairs_agg) * 1.25)
    sampled_negatives = random.sample(unobserved_pairs, min(num_negatives, len(unobserved_pairs)))
    
    negative_rows = []
    for g1, g2 in sampled_negatives:
        sa, sb = sorted([g1, g2])
        negative_rows.append({
            'target_a': sa,
            'target_b': sb,
            'num_drugs': 0,
            'max_tier': 0,
            'drug_names': 'None (Unscreened / Non-viable)',
            'indications': 'None',
            'label': 0
        })
    df_negatives = pd.DataFrame(negative_rows)
    print(f"[*] Generated {len(df_negatives)} negative/unviable target pairs.")
    
    # Combine into pairwise dataset
    df_pairwise = pd.concat([positive_pairs_agg, df_negatives], ignore_index=True)
    df_pairwise = df_pairwise.sample(frac=1.0, random_state=42).reset_index(drop=True)
    
    # Compute rich symmetric biological features for each pair
    feature_records = []
    for _, row in df_pairwise.iterrows():
        feat = compute_pairwise_features(row['target_a'], row['target_b'], indication="Lung Cancer")
        feature_records.append(feat)
        
    df_features = pd.DataFrame(feature_records)
    df_full = pd.concat([df_pairwise, df_features], axis=1)
    
    pairwise_file = os.path.join(output_dir, 'pairwise_dataset.csv')
    df_full.to_csv(pairwise_file, index=False)
    print(f"[+] Saved complete pairwise dataset ({len(df_full)} samples, {df_full.shape[1]} columns) to: {pairwise_file}")
    
    # Build target metadata dictionary for frontend and API
    target_dict = {}
    for g in all_genes:
        feat = get_target_features(g)
        # count occurrences in positive drugs
        count = int(df_valid[(df_valid['target_a'] == g) | (df_valid['target_b'] == g)].shape[0])
        target_dict[g] = {
            'symbol': g,
            'category': feat['category'],
            'localization': 'Cell Membrane' if feat['localization_score'] == 1.0 else ('Secreted/Extracellular' if feat['localization_score'] == 0.5 else 'Intracellular'),
            'molecular_weight_kda': feat['molecular_weight_kda'],
            'cancer_relevance': feat['cancer_relevance'],
            'toxicity_risk': feat['toxicity_risk'],
            'clinical_drugs_count': count
        }
        
    dict_file = os.path.join(output_dir, 'target_dictionary.json')
    with open(dict_file, 'w', encoding='utf-8') as f:
        json.dump(target_dict, f, indent=2)
    print(f"[+] Saved target dictionary ({len(target_dict)} targets) to: {dict_file}")
    
    print("\n" + "=" * 70)
    print("Phase 1 Complete: Dataset preprocessed, features extracted, and ready for ML!")
    print("=" * 70)
    return df_full

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    raw_path = os.path.join(base_dir, 'DATA', 'PROCESSED DATA', 'lung cancer.xlsx - Results.csv')
    out_dir = os.path.join(base_dir, 'DATA', 'PROCESSED DATA')
    build_datasets(raw_path, out_dir)
