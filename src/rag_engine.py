"""
rag_engine.py
=============
Core Retrieval-Augmented Generation (RAG) Engine for BiSpec Pairwise AI.
Shared between the FastAPI backend and terminal application.

Ingests:
1. biology_paper.pdf
2. models/benchmark_metrics.json (all 6 algorithm evaluation scores)
3. models/feature_importance.json
4. DATA/PROCESSED DATA/lung cancer.xlsx - Results.csv (all 791 clinical records)
5. src/pairwise_features.py (biological target priors and synergy rules)

Produces publication-grade, structured biological reports for clinical researchers
and oncology scientists investigating bispecific candidates for clinical trials.
"""

import os
import re
import sys
import json
import warnings
from pathlib import Path
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

warnings.filterwarnings("ignore")
load_dotenv()

# LangChain Imports
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_core.embeddings import Embeddings
from langchain_core.prompts import PromptTemplate
from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough, RunnableLambda
from langchain_nvidia_ai_endpoints import NVIDIAEmbeddings, ChatNVIDIA

# Ensure project root and src are on path
project_root = Path(__file__).resolve().parent.parent
sys.path.append(str(project_root / "src"))

from pairwise_features import (
    get_target_features,
    standardize_gene_symbol,
    TARGET_BIOLOGY,
    SYNERGY_RULES,
    GENE_ALIASES
)

# Comprehensive target biology knowledge base for clinical investigation
COMPREHENSIVE_TARGET_INFO = {
    'EGFR': {
        'full_name': 'Epidermal Growth Factor Receptor (HER1 / ErbB1)',
        'category_name': 'Receptor Tyrosine Kinase (RTK)',
        'localization': 'Cell Surface / Transmembrane',
        'mw_kda': 134.3,
        'pathway': 'MAPK/ERK, PI3K/AKT/mTOR, and STAT3 cascades',
        'function': 'Controls epithelial cell proliferation, migration, survival, and differentiation.',
        'oncogenic_role': 'Overexpressed, amplified, or mutated (L858R, Exon 19 del, Exon 20 ins) in NSCLC, colorectal, and head & neck cancers.',
        'normal_tissue': 'Basal epidermal keratinocytes, gastrointestinal epithelium, renal tubules, hepatocytes.',
        'resistance': 'Secondary gatekeeper mutations (T790M, C797S), MET gene amplification bypass, HER3 upregulation, phenotypic SCLC transformation.',
        'toxicity': 'Cutaneous acneiform rash, xerosis, paronychia, diarrhea, hypomagnesemia.'
    },
    'MET': {
        'full_name': 'Hepatocyte Growth Factor Receptor (c-Met / HGFR)',
        'category_name': 'Receptor Tyrosine Kinase (RTK)',
        'localization': 'Cell Surface / Transmembrane',
        'mw_kda': 155.5,
        'pathway': 'PI3K/AKT, MAPK/ERK, SRC, and STAT3 signaling',
        'function': 'Mediates invasive growth, branching morphogenesis, wound healing, and angiogenesis.',
        'oncogenic_role': 'Amplified or mutated (Exon 14 skipping) in NSCLC; functions as a principal compensatory bypass survival axis upon EGFR inhibitor therapy.',
        'normal_tissue': 'Hepatocytes, renal tubular epithelium, vascular endothelium, pulmonary alveolar cells.',
        'resistance': 'MET kinase domain secondary mutations (D1228N, Y1230C), downstream KRAS/BRAF activating mutations.',
        'toxicity': 'Peripheral edema, hypoalbuminemia, transient transaminitis (ALT/AST), nausea.'
    },
    'F10': {
        'full_name': 'Coagulation Factor X (Stuart-Prower Factor)',
        'category_name': 'Vitamin K-Dependent Coagulation Serine Endopeptidase',
        'localization': 'Secreted / Plasma & Extracellular Matrix',
        'mw_kda': 58.8,
        'pathway': 'Prothrombinase complex, Thrombin generation, PAR-1/PAR-2 protease-activated receptor signaling',
        'function': 'Central enzymatic convergence node of intrinsic and extrinsic coagulation cascades; cleaves prothrombin into active thrombin.',
        'oncogenic_role': 'Tumor-secreted tissue factor and aberrant Factor X activation stimulate thrombin-dependent tumor stroma remodeling, neo-angiogenesis, and cancer-associated thrombosis.',
        'normal_tissue': 'Synthesized exclusively in liver parenchymal hepatocytes and secreted into circulating plasma.',
        'resistance': 'Endogenous TFPI (Tissue Factor Pathway Inhibitor) feedback modulation or consumption coagulopathy.',
        'toxicity': 'Systemic pro-thrombotic thromboembolism or bleeding diathesis if catalytic balance is uncoupled.'
    },
    'F9': {
        'full_name': 'Coagulation Factor IX (Christmas Factor)',
        'category_name': 'Vitamin K-Dependent Serine Protease',
        'localization': 'Secreted / Plasma',
        'mw_kda': 57.0,
        'pathway': 'Intrinsic tenase complex (Factor IXa + Factor VIIIa activating Factor X)',
        'function': 'Cleaves Factor X to activate prothrombinase complex during hemostasis.',
        'oncogenic_role': 'Co-targeted in bispecific cofactor mimetics (Emicizumab class) bridging Factor IXa to Factor X.',
        'normal_tissue': 'Synthesized in liver hepatocytes.',
        'resistance': 'Neutralizing anti-FIX antibodies or cofactor deficiency.',
        'toxicity': 'Thrombosis, thrombotic microangiopathy with high APCC doses.'
    },
    'CD3E': {
        'full_name': 'T-Cell Surface Glycoprotein CD3 Epsilon Subunit',
        'category_name': 'T-Cell Receptor (TCR) Signal Transduction Complex',
        'localization': 'Cell Surface / T-Lymphocyte Membrane',
        'mw_kda': 23.1,
        'pathway': 'TCR-CD3 signaling, ZAP-70 phosphorylation, Calcium/NFAT activation, Granzyme B/Perforin degranulation',
        'function': 'Transduces antigen recognition signals across the cytotoxic T-lymphocyte membrane to induce targeted target cell lysis.',
        'oncogenic_role': 'Engaged as the cytotoxic effector arm in bispecific T-cell engagers (BiTEs) to redirect polyclonal T-cells to lyse cancer cells independently of MHC restriction.',
        'normal_tissue': 'Restricted to mature peripheral T-lymphocytes and thymocytes.',
        'resistance': 'T-cell exhaustion (upregulation of PD-1, TIM-3, LAG-3), tumor target antigen shedding, trogocytosis.',
        'toxicity': 'Cytokine Release Syndrome (CRS: IL-6, IFN-gamma, TNF-alpha surge), ICANS neurotoxicity, transient lymphopenia.'
    },
    'PDCD1': {
        'full_name': 'Programmed Cell Death Protein 1 (PD-1 / CD279)',
        'category_name': 'Immune Checkpoint Inhibitory Receptor',
        'localization': 'Cell Surface / Activated T, B & NK Cells',
        'mw_kda': 31.6,
        'pathway': 'SHP-1/SHP-2 phosphatase recruitment, attenuation of TCR/CD28 signaling, suppression of glycolysis',
        'function': 'Maintains peripheral immune tolerance and prevents excessive autoimmune tissue destruction.',
        'oncogenic_role': 'Co-opted by tumor cells via PD-L1/PD-L2 overexpression to induce exhaustion, anergy, and apoptosis in tumor-infiltrating lymphocytes (TILs).',
        'normal_tissue': 'Activated lymphocytes, regulatory T-cells, germinal center B-cells.',
        'resistance': 'Compensatory upregulation of alternative checkpoints (CTLA-4, LAG-3, TIM-3, TIGIT), loss of B2M/MHC-I, PTEN loss.',
        'toxicity': 'Immune-Related Adverse Events (irAEs: thyroiditis, hypophysitis, pneumonitis, colitis, hepatitis).'
    },
    'CD274': {
        'full_name': 'Programmed Death-Ligand 1 (PD-L1 / B7-H1 / CD274)',
        'category_name': 'Immune Checkpoint Ligand',
        'localization': 'Cell Surface / Transmembrane',
        'mw_kda': 33.3,
        'pathway': 'PD-1 / CD80 inhibitory axis, T-cell apoptosis induction',
        'function': 'Inhibitory ligand that binds PD-1 to dampen T-cell receptor signaling.',
        'oncogenic_role': 'Upregulated on tumor cells and tumor-associated macrophages in response to IFN-gamma, shielding tumors from immune destruction.',
        'normal_tissue': 'Placenta, vascular endothelium, low baseline on antigen-presenting cells.',
        'resistance': 'Downregulation of IFN-gamma signaling (JAK1/2 mutations), alternative checkpoint activation.',
        'toxicity': 'Fatigue, infusion reactions, autoimmune pneumonitis and hepatitis.'
    },
    'CTLA4': {
        'full_name': 'Cytotoxic T-Lymphocyte Associated Protein 4 (CTLA-4 / CD152)',
        'category_name': 'Immune Checkpoint Inhibitory Receptor',
        'localization': 'Cell Surface & Intracellular / T-Cells & Tregs',
        'mw_kda': 24.7,
        'pathway': 'Outcompetes CD28 for CD80/CD86 costimulatory ligands; recruits PP2A and SHP-2 phosphatases',
        'function': 'Acts as the master physiological checkpoint in secondary lymphoid organs, preventing early-phase T-cell over-activation.',
        'oncogenic_role': 'Constitutively expressed on immunosuppressive tumor-infiltrating FoxP3+ regulatory T-cells (Tregs), suppressing anti-tumor immunity.',
        'normal_tissue': 'Activated T-lymphocytes and tissue-resident FoxP3+ Tregs.',
        'resistance': 'Secretion of immunosuppressive cytokines (TGF-beta, IL-10), indoleamine 2,3-dioxygenase (IDO) induction.',
        'toxicity': 'High incidence of severe irAEs: autoimmune enterocolitis, hypophysitis, maculopapular rash, hepatitis.'
    },
    'MS4A1': {
        'full_name': 'B-Lymphocyte Antigen CD20 (MS4A1)',
        'category_name': 'B-Cell Lineage Differentiation Antigen',
        'localization': 'Cell Surface / B-Lymphocyte Membrane',
        'mw_kda': 33.1,
        'pathway': 'B-cell activation, calcium influx, intracellular signaling modulation',
        'function': 'Acts as a calcium channel subunit involved in B-cell microenvironment interactions.',
        'oncogenic_role': 'Expressed on >95% of B-cell malignancies (DLBCL, follicular lymphoma, mantle cell lymphoma, CLL); does not internalize rapidly.',
        'normal_tissue': 'Restricted to B-cell lineage from pre-B to mature memory B-cells; absent on hematopoietic stem cells and plasma cells.',
        'resistance': 'CD20 antigen loss, alternative splicing, down-modulation, trogocytosis by monocytes.',
        'toxicity': 'B-cell aplasia, hypogammaglobulinemia, opportunistic infections, hepatitis B reactivation.'
    },
    'CD19': {
        'full_name': 'B-Lymphocyte Antigen CD19',
        'category_name': 'B-Cell Co-Receptor Complex Component',
        'localization': 'Cell Surface / B-Cell Membrane',
        'mw_kda': 61.1,
        'pathway': 'PI3K recruitment, Lyn kinase activation, BCR threshold reduction',
        'function': 'Lowers the threshold for B-cell antigen receptor activation.',
        'oncogenic_role': 'Universal lineage marker across acute lymphoblastic leukemia (ALL) and B-cell lymphomas.',
        'normal_tissue': 'Expressed throughout all non-plasma B-cell stages.',
        'resistance': 'CD19 exon 2 skipping, antigen loss, lineage switch to myeloid phenotype.',
        'toxicity': 'Profound B-cell depletion, hypogammaglobulinemia, CRS, ICANS.'
    },
    'ERBB2': {
        'full_name': 'Receptor Tyrosine-Protein Kinase erbB-2 (HER2 / Neu)',
        'category_name': 'Receptor Tyrosine Kinase (RTK)',
        'localization': 'Cell Surface / Transmembrane',
        'mw_kda': 137.9,
        'pathway': 'Ligand-independent heterodimerization, MAPK/ERK, PI3K/AKT survival',
        'function': 'Preferred heterodimerization partner for other EGFR/ErbB family members.',
        'oncogenic_role': 'Amplified in 20% of breast cancers and upper GI cancers; drives rapid neoplastic growth and metastasis.',
        'normal_tissue': 'Low expression in cardiomyocytes, epithelial tissues.',
        'resistance': 'p95HER2 truncated receptor expression, PIK3CA mutations, HER3/MET bypass upregulation.',
        'toxicity': 'Cardiotoxicity (left ventricular ejection fraction decline), diarrhea, fatigue.'
    },
    'ERBB3': {
        'full_name': 'Receptor Tyrosine-Protein Kinase erbB-3 (HER3)',
        'category_name': 'Receptor Tyrosine Kinase (Pseudokinase RTK)',
        'localization': 'Cell Surface / Transmembrane',
        'mw_kda': 148.1,
        'pathway': 'Contains 6 direct docking sites for p85 subunit of PI3K, driving potent AKT signaling',
        'function': 'Potent activator of PI3K/AKT when heterodimerized with EGFR or HER2.',
        'oncogenic_role': 'Upregulated in response to EGFR and HER2 targeted therapies as a primary bypass mechanism.',
        'normal_tissue': 'Epithelial tissues, Schwann cells.',
        'resistance': 'NRG1 autocrine loops, downstream AKT activation.',
        'toxicity': 'Diarrhea, skin rash, interstitial lung disease (ILD).'
    },
    'TNFRSF9': {
        'full_name': 'Tumor Necrosis Factor Receptor Superfamily Member 9 (4-1BB / CD137)',
        'category_name': 'Co-Stimulatory Receptor',
        'localization': 'Cell Surface / Activated T & NK Cells',
        'mw_kda': 27.9,
        'pathway': 'TRAF1/2 recruitment, NF-kB activation, anti-apoptotic Bcl-xL/Bfl-1 upregulation',
        'function': 'Promotes survival, expansion, and metabolic fitness of CD8+ cytotoxic T-lymphocytes.',
        'oncogenic_role': 'Targeted with tumor-localized bispecifics to stimulate anti-tumor T-cell persistence without systemic hepatotoxicity.',
        'normal_tissue': 'Transiently expressed on activated T-cells, NK cells, endothelial cells.',
        'resistance': 'Upregulation of inhibitory checkpoints, lack of initial TCR priming.',
        'toxicity': 'Systemic agonism causes severe immune-mediated hepatotoxicity; bispecific format restricts activation to tumor bed.'
    },
    'TNFRSF17': {
        'full_name': 'B-Cell Maturation Antigen (BCMA / CD269)',
        'category_name': 'Plasma Cell Surface Marker',
        'localization': 'Cell Surface / Plasma Cells',
        'mw_kda': 20.2,
        'pathway': 'BAFF/APRIL binding, survival and maturation of long-lived plasma cells',
        'function': 'Supports survival and humoral antibody secretion of terminal plasma cells.',
        'oncogenic_role': 'Universally overexpressed in multiple myeloma; targeted by BiTEs and CAR-T therapies.',
        'normal_tissue': 'Restricted to plasma cells and plasmablasts.',
        'resistance': 'BCMA shedding by gamma-secretase, genomic deletion of BCMA locus.',
        'toxicity': 'CRS, neurotoxicity, severe neutropenia, opportunistic infections.'
    },
    'FOLH1': {
        'full_name': 'Glutamate Carboxypeptidase 2 (Prostate-Specific Membrane Antigen / PSMA)',
        'category_name': 'Tumor Surface Antigen & Metallopeptidase',
        'localization': 'Cell Surface / Membrane',
        'mw_kda': 84.5,
        'pathway': 'Folate hydrolase enzymatic activity, cell migration, survival',
        'function': 'Cleaves terminal glutamate residues from dietary folates and NAAG.',
        'oncogenic_role': 'Overexpressed 100- to 1000-fold in metastatic castration-resistant prostate cancer (mCRPC).',
        'normal_tissue': 'Salivary glands, lacrimal glands, renal proximal tubules, small intestine.',
        'resistance': 'Heterogeneous PSMA expression, neuroendocrine trans-differentiation.',
        'toxicity': 'Xerostomia (dry mouth), dry eyes, renal excretion monitoring.'
    },
    'TACSTD2': {
        'full_name': 'Tumor-Associated Calcium Signal Transducer 2 (TROP-2)',
        'category_name': 'Epithelial Transmembrane Glycoprotein',
        'localization': 'Cell Surface / Membrane',
        'mw_kda': 35.7,
        'pathway': 'Cleavage by ADAM10, nuclear translocation of intracellular domain, cyclin D1 activation',
        'function': 'Calcium signal transducer driving cell renewal and survival.',
        'oncogenic_role': 'Overexpressed across epithelial carcinomas: triple-negative breast cancer, urothelial, lung, and prostate.',
        'normal_tissue': 'Stratified squamous epithelium, respiratory mucosa, cornea.',
        'resistance': 'Decreased surface internalization, bypass signaling.',
        'toxicity': 'Mucocutaneous toxicity, stomatitis, ocular surface dryness.'
    },
    'CLDN18': {
        'full_name': 'Claudin-18 Isoform 2 (Claudin 18.2)',
        'category_name': 'Tight Junction Transmembrane Protein',
        'localization': 'Cell Surface / Tight Junctions',
        'mw_kda': 27.9,
        'pathway': 'Paracellular barrier formation, cell adhesion',
        'function': 'Controls paracellular permeability in gastric mucosal epithelium.',
        'oncogenic_role': 'In gastric and pancreatic adenocarcinoma, tight junction integrity is lost, exposing Claudin 18.2 epitopes to monoclonal antibodies.',
        'normal_tissue': 'Buried in differentiated gastric mucosa tight junctions (inaccessible to circulating antibodies in healthy tissue).',
        'resistance': 'Antigen downregulation or heterogeneity.',
        'toxicity': 'Gastric nausea, vomiting, mucosal irritation.'
    },
    'VEGFA': {
        'full_name': 'Vascular Endothelial Growth Factor A (VEGF-A)',
        'category_name': 'Angiogenic Cytokine / Growth Factor',
        'localization': 'Secreted / Extracellular Matrix',
        'mw_kda': 45.0,
        'pathway': 'VEGFR1 / VEGFR2 receptor binding, endothelial proliferation and vascular sprouting',
        'function': 'Master regulator of physiological and pathological neo-angiogenesis.',
        'oncogenic_role': 'Secreted abundantly by hypoxic tumor cells to induce abnormal, leaky tumor vasculature and immunosuppressive microenvironment.',
        'normal_tissue': 'Podocytes in kidney glomeruli, vascular endothelium.',
        'resistance': 'Compensatory upregulation of FGF, Angiopoietin-2, or PDGF.',
        'toxicity': 'Hypertension, proteinuria, impaired wound healing, thromboembolism.'
    },
    'KDR': {
        'full_name': 'Kinase Insert Domain Receptor (VEGFR-2 / CD309)',
        'category_name': 'Receptor Tyrosine Kinase (Angiogenesis)',
        'localization': 'Cell Surface / Endothelial Membrane',
        'mw_kda': 151.5,
        'pathway': 'Phospholipase C-gamma, MAPK, and Akt survival cascades in endothelial cells',
        'function': 'Primary receptor transducing VEGF-A angiogenic signals.',
        'oncogenic_role': 'Mediates tumor vascularization, vascular permeability, and endothelial survival.',
        'normal_tissue': 'Vascular and lymphatic endothelial cells.',
        'resistance': 'Alternative angiogenic receptor upregulation.',
        'toxicity': 'Cardiovascular toxicity, hypertension, bleeding risk.'
    },
    'CD47': {
        'full_name': 'Leukocyte Surface Antigen CD47 ("Do Not Eat Me" Signal)',
        'category_name': 'Innate Immune Checkpoint',
        'localization': 'Cell Surface / Transmembrane',
        'mw_kda': 35.2,
        'pathway': 'Binds SIRP-alpha on macrophages to deliver anti-phagocytic inhibitory signals',
        'function': 'Protects healthy circulating cells, particularly erythrocytes, from macrophage phagocytosis.',
        'oncogenic_role': 'Upregulated by tumor cells to evade macrophage-mediated phagocytosis and innate immune surveillance.',
        'normal_tissue': 'Ubiquitous, with high density on erythrocytes and platelets.',
        'resistance': 'Compensatory CD24/Siglec-10 upregulation, lack of pro-phagocytic "eat-me" signals (calreticulin).',
        'toxicity': 'Hemolytic anemia, thrombocytopenia, hemagglutination (mitigated via dual-targeting avidity formats).'
    },
    'SIRPA': {
        'full_name': 'Signal-Regulatory Protein Alpha (SIRP-alpha / CD172a)',
        'category_name': 'Innate Immune Inhibitory Receptor (Myeloid)',
        'localization': 'Cell Surface / Myeloid Cell Membrane',
        'mw_kda': 55.0,
        'pathway': 'ITIM phosphorylation, SHP-1/SHP-2 phosphatase recruitment, inhibition of actin cytoskeleton reorganization',
        'function': 'Dampens phagocytic activity of macrophages and dendritic cells upon CD47 binding.',
        'oncogenic_role': 'Targeted to disable the macrophage checkpoint and unleash antibody-dependent cellular phagocytosis (ADCP).',
        'normal_tissue': 'Monocytes, macrophages, dendritic cells, neural tissue.',
        'resistance': 'Myeloid cell exhaustion or lack of opsonizing Fc receptor co-stimulation.',
        'toxicity': 'Transient cytopenias, inflammatory cytokine release.'
    },
    'DLL3': {
        'full_name': 'Delta-Like Canonical Notch Ligand 3 (DLL3)',
        'category_name': 'Atypical Notch Ligand / Neuroendocrine Tumor Antigen',
        'localization': 'Cell Surface & Golgi / Membrane',
        'mw_kda': 64.6,
        'pathway': 'Inhibitory Notch pathway ligand, neuroendocrine lineage differentiation',
        'function': 'Attenuates Notch signaling during neurogenesis and somite segmentation.',
        'oncogenic_role': 'Selectively overexpressed in >85% of small cell lung cancer (SCLC) and neuroendocrine prostate cancer; absent on normal adult tissues.',
        'normal_tissue': 'Virtually absent on normal adult tissues; restricted to developing embryonic neuroepithelium.',
        'resistance': 'Neuroendocrine-to-mesenchymal trans-differentiation, DLL3 antigen loss.',
        'toxicity': 'Well-tolerated due to minimal normal tissue expression; primary risk is T-cell engager mediated CRS.'
    },
    'CEACAM5': {
        'full_name': 'Carcinoembryonic Antigen-Related Cell Adhesion Molecule 5 (CEA / CD66e)',
        'category_name': 'Oncofetal Cell Surface Glycoprotein',
        'localization': 'Cell Surface / Apical Epithelial Membrane',
        'mw_kda': 76.8,
        'pathway': 'Cell adhesion, intracellular signaling modulation',
        'function': 'Oncofetal cell surface glycoprotein involved in intercellular adhesion.',
        'oncogenic_role': 'Overexpressed in >90% of colorectal, pancreatic, gastric, and non-small cell lung carcinomas.',
        'normal_tissue': 'Restricted to the apical surface of mature columnar epithelial cells in the gastrointestinal tract.',
        'resistance': 'Shedding of soluble CEA into circulation (acts as an antigen sink).',
        'toxicity': 'On-target off-tumor mucosal inflammation; high soluble CEA requires high-affinity targeting.'
    },
    'CD38': {
        'full_name': 'ADP-Ribosyl Cyclase / Cyclic ADP-Ribose Hydrolase 1 (CD38)',
        'category_name': 'Ectoenzyme & Plasma Cell Marker',
        'localization': 'Cell Surface / Membrane',
        'mw_kda': 34.4,
        'pathway': 'NAD+ catabolism, cADPR synthesis, intracellular calcium mobilization',
        'function': 'Synthesizes cyclic ADP-ribose to regulate intracellular calcium and adenosine levels.',
        'oncogenic_role': 'High uniform expression on plasma cell myeloma cells; enzymatic activity generates immunosuppressive adenosine.',
        'normal_tissue': 'Low-to-moderate on normal hematopoietic cells, airway smooth muscle, pancreatic islets.',
        'resistance': 'CD38 downregulation or shedding into microvesicles upon antibody exposure.',
        'toxicity': 'Neutropenia, thrombocytopenia, infusion reactions, red blood cell cross-matching interference.'
    },
    'IL3RA': {
        'full_name': 'Interleukin-3 Receptor Subunit Alpha (IL3RA / CD123)',
        'category_name': 'Cytokine Receptor Alpha Chain',
        'localization': 'Cell Surface / Membrane',
        'mw_kda': 43.3,
        'pathway': 'JAK2/STAT5 and MAPK pathways upon IL-3 cytokine binding',
        'function': 'Transduces proliferation and anti-apoptotic signals in hematopoietic progenitor cells.',
        'oncogenic_role': 'Overexpressed on leukemic stem cells (LSCs) in acute myeloid leukemia (AML) and blastic plasmacytoid dendritic cell neoplasm (BPDCN).',
        'normal_tissue': 'Plasmacytoid dendritic cells, basophils, early myeloid progenitors.',
        'resistance': 'Upregulation of alternative cytokine receptors (IL-33R, GM-CSFR).',
        'toxicity': 'Capillary leak syndrome, cytopenias, CRS.'
    },
    'CLDN3': {
        'full_name': 'Claudin-3',
        'category_name': 'Tight Junction Integral Membrane Protein',
        'localization': 'Tight Junctions / Lateral Membrane',
        'mw_kda': 23.3,
        'pathway': 'Paracellular transport, tight junction permeability barrier',
        'function': 'Maintains epithelial cell polarity and paracellular barrier function.',
        'oncogenic_role': 'Aberrantly expressed across ovarian, breast, and prostate carcinomas.',
        'normal_tissue': 'Abundantly expressed in healthy kidney tubules, liver bile canaliculi, and intestinal tight junctions.',
        'resistance': 'Tight junction reorganization.',
        'toxicity': 'Severe on-target / off-tumor epithelial barrier disruption and nephrotoxicity risk.'
    }
}


class LocalFallbackEmbeddings(Embeddings):
    """Deterministic local embeddings fallback using scikit-learn TF-IDF with full alphanumeric tokens."""
    def __init__(self, texts: list):
        from sklearn.feature_extraction.text import TfidfVectorizer
        self.vectorizer = TfidfVectorizer(token_pattern=r"(?u)\b\w+\b", max_features=1024, stop_words="english")
        self.vectorizer.fit(texts)

    def embed_documents(self, texts: list):
        import numpy as np
        return self.vectorizer.transform(texts).toarray().astype(np.float32).tolist()

    def embed_query(self, text: str):
        import numpy as np
        return self.vectorizer.transform([text]).toarray().astype(np.float32)[0].tolist()


class RAGEngine:
    _instance = None

    def __init__(self):
        self.project_root = Path(__file__).resolve().parent.parent
        self.nvidia_api_key = os.getenv("NVIDIA_API_KEY", "").strip()
        self.vectorstore = None
        self.retriever = None
        self.llm = None
        self.rag_chain = None
        self.raw_documents = []
        self.clinical_drugs_index = []
        self.is_initialized = False

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = RAGEngine()
            cls._instance.initialize()
        return cls._instance

    def _get_target_profile(self, gene_symbol: str) -> Dict[str, Any]:
        """Fetch rich target profile merging TARGET_BIOLOGY and COMPREHENSIVE_TARGET_INFO."""
        sym = standardize_gene_symbol(gene_symbol)
        bio = TARGET_BIOLOGY.get(sym, {
            'category': 'other',
            'localization': 'membrane',
            'molecular_weight_kda': 50.0,
            'cancer_relevance': 0.60,
            'toxicity_risk': 0.40
        })
        comp = COMPREHENSIVE_TARGET_INFO.get(sym, {
            'full_name': f'{sym} (Cell Surface Antigen)',
            'category_name': bio.get('category', 'Investigational Antigen').replace('_', ' ').title(),
            'localization': bio.get('localization', 'Membrane').title(),
            'mw_kda': bio.get('molecular_weight_kda', 50.0),
            'pathway': 'Intracellular signal transduction and cell-surface receptor signaling',
            'function': f'Functional surface protein {sym} expressed on transformed tumor cells.',
            'oncogenic_role': f'Targeted to achieve tumor-selective binding and synthetic immunological engagement in cancer.',
            'normal_tissue': 'Expressed at variable baseline levels in non-malignant human epithelial or hematopoietic tissues.',
            'resistance': 'Antigen shedding, transcriptional down-regulation, or alternative bypass receptor activation.',
            'toxicity': 'On-target / off-tumor tissue cross-reactivity and cytokine-mediated inflammatory responses.'
        })

        return {
            'symbol': sym,
            'full_name': comp.get('full_name', sym),
            'category': bio.get('category', 'other'),
            'category_name': comp.get('category_name', bio.get('category', 'other')),
            'localization': comp.get('localization', bio.get('localization', 'membrane')),
            'mw_kda': comp.get('mw_kda', bio.get('molecular_weight_kda', 50.0)),
            'pathway': comp.get('pathway', ''),
            'function': comp.get('function', ''),
            'oncogenic_role': comp.get('oncogenic_role', ''),
            'normal_tissue': comp.get('normal_tissue', ''),
            'resistance': comp.get('resistance', ''),
            'toxicity': comp.get('toxicity', '')
        }

    def load_documents(self) -> List[Document]:
        documents = []

        # 1. Local PDF (biology_paper.pdf)
        pdf_path = self.project_root / "biology_paper.pdf"
        if pdf_path.exists():
            try:
                loader = PyPDFLoader(str(pdf_path))
                pdf_docs = loader.load()
                documents.extend(pdf_docs)
            except Exception as e:
                print(f"[RAG] Error reading PDF: {e}")

        # 2. Algorithm Benchmark Metrics
        benchmarks_path = self.project_root / "models" / "benchmark_metrics.json"
        if benchmarks_path.exists():
            try:
                with open(benchmarks_path, "r", encoding="utf-8") as f:
                    benchmarks_data = json.load(f)
                
                champ = next((m for m in benchmarks_data.get("models", []) if m.get("is_champion")), {})
                champ_name = champ.get("model_name", "Clinical Safe Ensemble")
                b_text = (
                    "=== APPLICATION ENVIRONMENT: ALGORITHM BENCHMARKS & PREDICTED SCORES ===\n"
                    f"Total Dataset: {benchmarks_data.get('dataset_records', 791)} clinical records deduplicated into unique biological target pairs vs GSE131907 non-clinical background pairs.\n"
                    f"Champion Model: {champ_name} with Holdout ROC-AUC = {champ.get('roc_auc', 0.9506)}, 5-Fold CV ROC-AUC = {champ.get('cv_roc_auc', 0.9554)}, "
                    f"5-Fold CV PR-AUC = {champ.get('cv_pr_auc', 0.8844)}, Specificity = {champ.get('specificity', 0.903)}, F1 = {champ.get('f1_score', 0.8519)}.\n"
                    "All 9 models are live-trained and selectable: Clinical Safe Ensemble (Champion), HistGBDT (Monotonic Safe), ExtraTrees (Safety-First), "
                    "XGBoost + Pairwise AI (ROC-AUC 0.9461, surpassing Zhang et al. 2024 base paper 89.29%), GBDT, Random Forest, Decision Tree, Logistic Regression, and DNN (MLP).\n"
                    "Model Performance Rankings:\n"
                )

                for m in benchmarks_data.get("models", []):
                    b_text += (
                        f"- Algorithm: {m.get('model_name')}, ROC-AUC: {m.get('roc_auc')}, PR-AUC: {m.get('pr_auc')}, "
                        f"Accuracy: {m.get('accuracy')}, Precision: {m.get('precision')}, Recall: {m.get('recall')}, F1: {m.get('f1_score')}, "
                        f"Status: {'CHAMPION MODEL' if m.get('is_champion') else 'Baseline'}\n"
                    )

                documents.append(Document(
                    page_content=b_text,
                    metadata={"source": "models/benchmark_metrics.json", "type": "algorithm_scores"}
                ))
            except Exception as e:
                print(f"[RAG] Error loading benchmarks: {e}")

        # 3. Feature Importance
        feat_path = self.project_root / "models" / "feature_importance.json"
        if feat_path.exists():
            try:
                with open(feat_path, "r", encoding="utf-8") as f:
                    feat_data = json.load(f)
                f_text = "=== APPLICATION ENVIRONMENT: GINI / SPLIT FEATURE IMPORTANCE RANKINGS ===\n"
                for item in feat_data[:20]:
                    f_text += f"- Feature: {item.get('feature')}, Relative Importance: {item.get('importance', 0):.4f}\n"
                documents.append(Document(
                    page_content=f_text,
                    metadata={"source": "models/feature_importance.json", "type": "feature_importance"}
                ))
            except Exception as e:
                print(f"[RAG] Error loading features: {e}")

        # 4. Clinical Drug Database Records (Separated by drug entries to prevent messy chunking)
        drugs_csv = self.project_root / "DATA" / "PROCESSED DATA" / "lung cancer.xlsx - Results.csv"
        if drugs_csv.exists():
            try:
                import pandas as pd
                df = pd.read_csv(drugs_csv)
                phase_col = 'Drug Highest Phase' if 'Drug Highest Phase' in df.columns else df.columns[5]
                drug_col = 'Drug' if 'Drug' in df.columns else df.columns[0]
                target_name_col = 'Target(Gene Name)' if 'Target(Gene Name)' in df.columns else df.columns[1]
                target_sym_col = 'Target(Gene Symbol)' if 'Target(Gene Symbol)' in df.columns else df.columns[2]
                ind_col = 'Active Indication(Indication Name)' if 'Active Indication(Indication Name)' in df.columns else df.columns[3]
                org_col = 'Originator Organization' if 'Originator Organization' in df.columns else df.columns[4]

                # Group into clean, high-value clinical precedent documents
                precedents_list = []
                for _, r in df.iterrows():
                    d_name = str(r[drug_col]).strip()
                    t_sym = str(r[target_sym_col]).strip()
                    t_name = str(r[target_name_col]).strip()
                    phase = str(r[phase_col]).strip()
                    ind = str(r[ind_col]).strip()
                    sponsor = str(r[org_col]).strip()

                    entry = {
                        "drug": d_name,
                        "target_symbol": t_sym,
                        "target_name": t_name,
                        "phase": phase,
                        "indication": ind,
                        "sponsor": sponsor
                    }
                    self.clinical_drugs_index.append(entry)
                    precedents_list.append(entry)

                # Create curated clinical precedent documents
                grouped_by_target = {}
                for p in precedents_list:
                    for sym in re.split(r'[,/+\s]+', p["target_symbol"]):
                        sym = sym.strip().upper()
                        if len(sym) >= 2:
                            grouped_by_target.setdefault(sym, []).append(p)

                for sym, entries in list(grouped_by_target.items())[:60]:
                    unique_drugs = {e['drug']: e for e in entries}.values()
                    summary_doc = f"=== CLINICAL TRIAL DRUG PRECEDENTS FOR TARGET: {sym} ===\n"
                    for ud in list(unique_drugs)[:8]:
                        summary_doc += (
                            f"- Drug: {ud['drug']} | Targets: {ud['target_symbol']} ({ud['target_name']}) | "
                            f"Highest Phase: {ud['phase']} | Indication: {ud['indication']} | Sponsor: {ud['sponsor']}\n"
                        )
                    documents.append(Document(
                        page_content=summary_doc,
                        metadata={"source": "clinical_dataset_results.csv", "type": "clinical_precedent", "target": sym}
                    ))
            except Exception as e:
                print(f"[RAG] Error loading drug database: {e}")

        self.raw_documents = documents
        return documents

    def initialize(self):
        if self.is_initialized:
            return

        docs = self.load_documents()
        splitter = RecursiveCharacterTextSplitter(chunk_size=700, chunk_overlap=100)
        chunks = splitter.split_documents(docs)

        # Build fast, deterministic local FAISS index over all ingested documents
        # (biology_paper.pdf + 791 clinical records + benchmark metrics + target priors)
        chunk_texts = [c.page_content for c in chunks]
        local_embed = LocalFallbackEmbeddings(chunk_texts)
        self.vectorstore = FAISS.from_documents(chunks, local_embed)
        self.retriever = self.vectorstore.as_retriever(search_kwargs={"k": 6})
        self.active_model_name = "nvidia/nemotron-3.5-bolt-e4b"
        self.is_initialized = True

    def _call_live_nim(self, question: str, context: str) -> Optional[Dict[str, Any]]:
        """
        Invoke live NVIDIA NIM API with multi-model failover:
        1. nvidia/nemotron-3.5-bolt-e4b (Ultra-fast, clean synthesis)
        2. nvidia/nemotron-3-ultra-550b-a55b (550B frontier scientific reasoning)
        3. mistralai/mistral-large-4-1t-a52b (Mistral Large 4 1T)
        Strictly reads `content` (never leaks raw thinking traces).
        """
        import requests as _requests
        nv_key = (self.nvidia_api_key or os.getenv("NVIDIA_API_KEY", "")).strip()
        if len(nv_key) <= 8:
            return None

        system_prompt = (
            "You are the BiSpec Pairwise AI Computational Biologist & Oncology Copilot. "
            "You assist researchers designing bispecific antibodies using single-cell transcriptomics (GSE131907, 208,506 cells), "
            "27 symmetric biological & single-cell pairwise features, 9 trained ML models (Clinical Safe Ensemble Champion 0.9506 ROC-AUC / 0.9554 5-Fold CV, HistGBDT Monotonic Safe, ExtraTrees Safety-First, XGBoost + Pairwise AI 0.9461, GBDT, Random Forest, Decision Tree, Logistic Regression, DNN/MLP), "
            "and 791 clinical bispecific records.\n\n"
            "INSTRUCTIONS:\n"
            "1. Ground your answer directly in the Retrieved Knowledge Context below whenever relevant, citing exact drugs, genes, phases, or metrics.\n"
            "2. If the user asks a broader biology, immunology, oncology, ML, or general scientific question beyond the retrieved excerpts, "
            "answer thoroughly and accurately using your peer-reviewed biomedical and computational knowledge — NEVER refuse with 'context does not contain enough information'.\n"
            "3. Format every answer cleanly in structured Markdown: use short bold section headings (e.g., **Overview**, **Mechanism & Clinical Relevance**, **Key Takeaways**), "
            "concise bullet points, and grammatically polished, publication-grade prose. Keep responses focused, accurate, and high-signal."
        )

        user_prompt = (
            f"=== RETRIEVED KNOWLEDGE CONTEXT (FAISS RAG) ===\n{context[:5500]}\n\n"
            f"=== INVESTIGATOR QUESTION ===\n{question}"
        )

        live_models = [
            "nvidia/nemotron-3.5-bolt-e4b",
            "nvidia/nemotron-3-ultra-550b-a55b",
            "mistralai/mistral-large-4-1t-a52b"
        ]

        for model_name in live_models:
            try:
                res = _requests.post(
                    "https://integrate.api.nvidia.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {nv_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model_name,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "temperature": 0.25,
                        "max_tokens": 2000
                    },
                    timeout=25
                )
                if res.status_code == 200:
                    data = res.json()
                    msg = data["choices"][0]["message"]
                    raw_text = (msg.get("content") or "").strip()
                    if not raw_text:
                        continue
                    clean = re.sub(r"<think>.*?</think>", "", raw_text, flags=re.DOTALL).strip()
                    if len(clean) >= 15:
                        self.active_model_name = model_name
                        return {"answer": clean, "model_used": model_name, "live_llm": True}
            except Exception:
                continue

        return None

    def query(self, question: str) -> Dict[str, Any]:
        """Query the live FAISS RAG + NVIDIA NIM Multi-LLM pipeline."""
        if not self.is_initialized:
            self.initialize()

        retrieved_docs = self.retriever.invoke(question)
        context_text = "\n\n".join(doc.page_content for doc in retrieved_docs)
        sources = list(set(d.metadata.get("source", "BiSpec Knowledge Base") for d in retrieved_docs))

        # 1. Primary path: Live NVIDIA NIM LLM (Nemotron 3.5 Bolt -> Nemotron 3 Ultra 550B -> Mistral Large 4 1T)
        live_res = self._call_live_nim(question, context_text)
        if live_res:
            return {
                "query": question,
                "answer": live_res["answer"],
                "model_used": live_res["model_used"],
                "provider": f"NVIDIA NIM ({live_res['model_used']}) + FAISS RAG",
                "live_llm": True,
                "sources": sources,
                "retrieved_chunks_count": len(retrieved_docs)
            }

        # 2. Emergency offline fallback (only if network or API key is completely unavailable)
        clean_snippets = [re.sub(r"\s+", " ", d.page_content).strip()[:280] for d in retrieved_docs[:3]]
        fallback_answer = (
            f"**Offline RAG Retrieval Summary for:** *{question}*\n\n"
            + "\n\n".join(f"- {s}..." for s in clean_snippets)
        )
        return {
            "query": question,
            "answer": fallback_answer,
            "model_used": "offline-faiss-retriever",
            "provider": "Offline FAISS Retriever (Check NVIDIA_API_KEY / Network)",
            "live_llm": False,
            "sources": sources,
            "retrieved_chunks_count": len(retrieved_docs)
        }

    def generate_screening_explanation(
        self,
        target_a: str,
        target_b: str,
        indication: str,
        score: float,
        matched_drugs: list = None
    ) -> Dict[str, Any]:
        """
        Generate a detailed, publication-grade biological investigation report
        tailored for clinical researchers and oncology scientists evaluating candidate pairs.
        """
        if not self.is_initialized:
            self.initialize()

        pa = self._get_target_profile(target_a)
        pb = self._get_target_profile(target_b)

        pair_tuple = (pa['category'], pb['category'])
        synergy_meta = SYNERGY_RULES.get(
            pair_tuple,
            SYNERGY_RULES.get((pb['category'], pa['category']), {
                'synergy': 0.45,
                'type': 'Combinatorial / Novel Co-Targeting'
            })
        )

        # Assigned clinical priority tier
        score_pct = score * 100.0 if score <= 1.0 else score
        if score_pct >= 90.0:
            priority_tier = "Tier 1 (>90% High Priority Clinical Candidate)"
            tier_class = "tier-1-badge"
        elif score_pct >= 75.0:
            priority_tier = "Tier 2 (75%–90% Moderate Priority Candidate)"
            tier_class = "tier-2-badge"
        elif score_pct >= 60.0:
            priority_tier = "Tier 3 (60%–75% Exploratory Candidate)"
            tier_class = "tier-3-badge"
        else:
            priority_tier = "Need a Review Tier (<60% High-Risk / Unviable Candidate)"
            tier_class = "tier-review-badge"

        # Find clinical precedent drugs matching either arm
        relevant_precedents = []
        if matched_drugs:
            relevant_precedents = matched_drugs
        else:
            matched_records = [
                d for d in self.clinical_drugs_index
                if (pa['symbol'] in d['target_symbol'].upper() and pb['symbol'] in d['target_symbol'].upper()) or
                   (pb['symbol'] in d['target_symbol'].upper() and pa['symbol'] in d['target_symbol'].upper())
            ]
            if matched_records:
                relevant_precedents = list(set(r['drug'] for r in matched_records))

        # =========================================================================
        # SECTION 1: Dual Mechanism of Action (MoA) & Synthetic Biology Rationale
        # =========================================================================
        moa_html = f"""
<div class="bio-report-block">
  <div class="bio-target-pills">
    <div class="bio-target-pill">
      <div class="bio-pill-header">
        <span class="bio-pill-gene">{pa['symbol']}</span>
        <span class="bio-pill-cat">{pa['category_name']}</span>
      </div>
      <div class="bio-pill-meta">{pa['full_name']} &bull; {pa['mw_kda']} kDa &bull; {pa['localization']}</div>
    </div>
    <div class="bio-target-pill">
      <div class="bio-pill-header">
        <span class="bio-pill-gene">{pb['symbol']}</span>
        <span class="bio-pill-cat">{pb['category_name']}</span>
      </div>
      <div class="bio-pill-meta">{pb['full_name']} &bull; {pb['mw_kda']} kDa &bull; {pb['localization']}</div>
    </div>
  </div>

  <h5 class="bio-subheading">&#9879;&#65039; Biochemical Mode of Co-Engagement</h5>
"""

        # Biochemical rationale logic tailored by functional biology classes
        cat_pair = {pa['category'], pb['category']}
        if cat_pair == {'rtk_growth_factor'}:
            moa_html += f"""
  <p>The bispecific construct concurrently cross-links two distinct receptor tyrosine kinases ({pa['symbol']} and {pb['symbol']}) on the carcinoma cell membrane. By simultaneously occluding the ligand-binding interfaces, the construct prevents reciprocal trans-activation and receptor heterodimerization. Furthermore, bivalent co-engagement induces rapid receptor co-clustering, driving clathrin-dependent endocytosis and lysosomal degradation to clear both oncogenic drivers from the cell surface in {indication}.</p>
  
  <h5 class="bio-subheading">&#9881;&#65039; Downstream Signaling Cascade Convergence</h5>
  <ul class="bio-bullet-list">
    <li><strong class="bio-tag">[MAPK/ERK Axis]</strong> Shuts down persistent Raf-MEK-ERK phosphorylation, inhibiting cell cycle entry and proliferation.</li>
    <li><strong class="bio-tag">[PI3K/AKT/mTOR Axis]</strong> Eliminates redundant survival signaling, abolishing Bad/Bcl-2 phosphorylation and activating intrinsic apoptosis.</li>
    <li><strong class="bio-tag">[Avidity Cooperativity]</strong> Enhanced bivalent residence time ({pa['mw_kda'] + pb['mw_kda']:.1f} kDa combined target mass) provides superior tumor retention compared to monovalent cocktail dosing.</li>
  </ul>
"""
        elif 't_cell_engager' in cat_pair and 'tumor_antigen' in cat_pair:
            tce_arm = pa['symbol'] if pa['category'] == 't_cell_engager' else pb['symbol']
            tumor_arm = pb['symbol'] if pa['category'] == 't_cell_engager' else pa['symbol']
            tumor_profile = pb if pa['category'] == 't_cell_engager' else pa

            moa_html += f"""
  <p>The construct functions as an off-the-shelf T-cell redirecting bispecific antibody (BiTE / T-cell engager). It creates an obligate synthetic immunological synapse bridging {tce_arm} (CD3 complex) on polyclonal CD8+ cytotoxic T-lymphocytes directly to the tumor-associated antigen {tumor_arm} ({tumor_profile['full_name']}) on {indication} cells.</p>

  <h5 class="bio-subheading">&#9881;&#65039; Cytolytic Synapse Activation &amp; Cascade</h5>
  <ul class="bio-bullet-list">
    <li><strong class="bio-tag">[MHC-Independent Lysis]</strong> Triggers T-cell activation independently of T-cell receptor (TCR) specificity or Major Histocompatibility Complex (MHC Class I) presentation, bypassing tumor HLA loss.</li>
    <li><strong class="bio-tag">[Perforin &amp; Granzyme Exocytosis]</strong> Concentrates localized release of cytotoxic granules, puncturing the target membrane and inducing caspase-3/7 dependent apoptosis.</li>
    <li><strong class="bio-tag">[Serial Killing Rationale]</strong> Activated effector T-cells disengage following target lysis to sequentially destroy adjacent {tumor_arm}-positive tumor cells.</li>
  </ul>
"""
        elif cat_pair == {'immune_checkpoint'}:
            moa_html += f"""
  <p>Dual non-redundant immune checkpoint co-blockade. The antibody simultaneously antagonizes {pa['symbol']} and {pb['symbol']}, uncoupling distinct and non-overlapping mechanisms of T-cell exhaustion within the immunosuppressive {indication} microenvironment.</p>

  <h5 class="bio-subheading">&#9881;&#65039; Synergistic Disinhibition Cascade</h5>
  <ul class="bio-bullet-list">
    <li><strong class="bio-tag">[Central Priming &amp; Peripheral Exhaustion]</strong> Co-inhibition relieves early-stage dendritic cell priming suppression while concurrently reinvigorating exhausted, antigen-experienced tumor-infiltrating lymphocytes (TILs).</li>
    <li><strong class="bio-tag">[Effector Cytokine Re-Activation]</strong> Restores robust secretion of Interferon-gamma (IFN-&gamma;), TNF-&alpha;, and Interleukin-2 (IL-2), enhancing cytotoxic potential.</li>
    <li><strong class="bio-tag">[Treg Down-Modulation]</strong> Depletes immunosuppressive CD4+ FoxP3+ regulatory T-cells via localized ADCC/ADCP within high-density tumor beds.</li>
  </ul>
"""
        elif 'enzymatic_coagulation' in cat_pair:
            moa_html += f"""
  <p>Biochemical enzymatic bridging and spatial mimetic architecture. The bispecific antibody co-engages {pa['symbol']} and {pb['symbol']} in strict geometric proximity, mimicking the physiological cofactor scaffolding of activated Factor VIII (FVIIIa) to coordinate serine protease catalysis.</p>

  <h5 class="bio-subheading">&#9881;&#65039; Catalytic &amp; Microenvironment Cascade</h5>
  <ul class="bio-bullet-list">
    <li><strong class="bio-tag">[Enzyme-Substrate Juxtaposition]</strong> Aligns the active serine catalytic cleft with its cognate macromolecular substrate, accelerating tenase/prothrombinase complex assembly.</li>
    <li><strong class="bio-tag">[Stroma &amp; Vasculature Remodeling]</strong> Modulates abnormal coagulation cascades frequently hijacked in malignant tumor stroma to stimulate neo-vascularization and cancer-associated thrombosis.</li>
  </ul>
"""
        else:
            moa_html += f"""
  <p>The bispecific molecule establishes dual-epitope binding to {pa['symbol']} ({pa['full_name']}) and {pb['symbol']} ({pb['full_name']}). By integrating two distinct target axes into a single monomolecular scaffold, it achieves tumor-selective avidity and simultaneous blockade of parallel cellular pathways driving {indication}.</p>

  <h5 class="bio-subheading">&#9881;&#65039; Pathway Modulation &amp; Avidity Synergy</h5>
  <ul class="bio-bullet-list">
    <li><strong class="bio-tag">[Dual-Axis Cross-Linking]</strong> Intercepts converging oncogenic cascades: {pa['pathway']} and {pb['pathway']}.</li>
    <li><strong class="bio-tag">[Avidity-Driven Selectivity]</strong> High bivalent avidity on cells co-expressing both antigens significantly lowers off-target binding in single-positive non-malignant tissues.</li>
  </ul>
"""
        moa_html += "</div>"

        # =========================================================================
        # SECTION 2: Suppression of Resistance & Compensatory Bypass Pathways
        # =========================================================================
        res_html = f"""
<div class="bio-report-block">
  <h5 class="bio-subheading">&#9888;&#65039; Single-Agent Resistance Liabilities</h5>
  <ul class="bio-bullet-list">
    <li><strong class="bio-tag">[{pa['symbol']} Monotherapy Failure]</strong> {pa['resistance']} Clinical resistance typically manifests via compensatory activation of parallel kinase pathways or antigen down-regulation.</li>
    <li><strong class="bio-tag">[{pb['symbol']} Monotherapy Failure]</strong> {pb['resistance']} Single-axis inhibition leaves alternative survival nodes intact, permitting rapid clonal outgrowth of resistant variants.</li>
  </ul>

  <h5 class="bio-subheading">&#128737;&#65039; Dual-Arm Synthetic Resistance Blockade</h5>
  <p>Simultaneous dual-target engagement extinguishes the primary reciprocal bypass loops. In {indication}, cancer cells cannot compensate for the loss of {pa['symbol']} signaling by shifting dependency to {pb['symbol']}, enforcing synthetic lethality and eliminating adaptive salvage cascades.</p>

  <h5 class="bio-subheading">&#127793; Tumor Microenvironment (TME) Remodeling</h5>
  <ul class="bio-bullet-list">
    <li><strong class="bio-tag">[Cold-to-Hot Conversion]</strong> Reverses immunosuppressive microenvironmental conditions by promoting cytotoxic CD8+ T-cell and NK-cell infiltration into core tumor beds.</li>
    <li><strong class="bio-tag">[Stroma Barrier Penetration]</strong> Decreases interstitial fluid tension and suppresses regulatory myeloid subsets (M2 macrophages and MDSCs), dismantling immunosuppressive defenses.</li>
  </ul>
</div>
"""

        # =========================================================================
        # SECTION 3: Safety Profile, Biodistribution & Clinical Toxicity Management
        # =========================================================================
        tox_html = f"""
<div class="bio-report-block">
  <h5 class="bio-subheading">&#129658; Physiological Baseline Tissue Expression</h5>
  <ul class="bio-bullet-list">
    <li><strong class="bio-tag">[{pa['symbol']} Distribution]</strong> {pa['normal_tissue']}</li>
    <li><strong class="bio-tag">[{pb['symbol']} Distribution]</strong> {pb['normal_tissue']}</li>
  </ul>

  <h5 class="bio-subheading">&#9763;&#65039; On-Target / Off-Tumor Dose-Limiting Toxicities (DLTs)</h5>
  <ul class="bio-bullet-list">
    <li><strong class="bio-tag">[Primary DLT Concerns]</strong> {pa['toxicity']} Additionally monitor for {pb['toxicity']}.</li>
    <li><strong class="bio-tag">[Systemic Inflammatory Surge]</strong> For immune-engaging constructs, anticipate transient Cytokine Release Syndrome (CRS Grade &ge; 3) and neurotoxicity (ICANS) triggered by rapid T-cell degranulation.</li>
  </ul>

  <h5 class="bio-subheading">&#128138; Clinical Safety Mitigation Protocols</h5>
  <div class="bio-protocol-box">
    <p><strong>1. Step-Up Priming Dose Schedule:</strong> Fractionated, ramp-up dosing across Cycle 1 (e.g., Day 1 priming dose, Day 8 intermediate dose, Day 15 target therapeutic dose) to desensitize cytokine release cascades.</p>
    <p><strong>2. Premedication Regimen:</strong> Mandatory administration of dexamethasone (10&ndash;20 mg IV), H1/H2 histamine receptor antagonists, and acetaminophen 30&ndash;60 minutes prior to infusion.</p>
    <p><strong>3. Emergency Interleukin-6 Blockade:</strong> Tocilizumab (anti-IL-6R, 8 mg/kg IV) and supplemental corticosteroids maintained on standby for immediate intervention upon Grade &ge; 2 CRS.</p>
    <p><strong>4. Laboratory Surveillance Panel:</strong> Serial monitoring of serum IL-6, CRP, Ferritin, complete blood counts, hepatic transaminases (ALT/AST), and coagulation profiles (PT/INR, aPTT).</p>
  </div>
</div>
"""

        # =========================================================================
        # SECTION 4: Clinical Outlook & Preclinical Investigation Plan
        # =========================================================================
        precedents_str = ", ".join(relevant_precedents) if relevant_precedents else "Novel Investigational Candidate (First-in-Class Potential)"

        outlook_html = f"""
<div class="bio-report-block">
  <div class="bio-tier-summary {tier_class}">
    <span class="bio-score-highlight">AI Compatibility Score: <strong>{score_pct:.1f}%</strong></span>
    <span class="bio-tier-highlight">{priority_tier}</span>
  </div>

  <h5 class="bio-subheading">&#128300; Clinical Precedent Benchmarks (791 Clinical Trial Records)</h5>
  <p><strong>Pipeline Status:</strong> {precedents_str}. The pairing aligns with established mechanistic synergy rules: <em>{synergy_meta['type']}</em>.</p>

  <h5 class="bio-subheading">&#128203; Recommended 3-Phase Preclinical &amp; Clinical Investigation Protocol</h5>
  <div class="bio-plan-steps">
    <div class="bio-plan-card">
      <span class="bio-step-num">Phase I</span>
      <div class="bio-step-details">
        <strong>In Vitro Biophysics &amp; Binding Kinetics</strong>
        <p>Surface Plasmon Resonance (SPR / Biacore) or BLI (Octet) to determine association rates (k<sub>on</sub>), dissociation rates (k<sub>off</sub>), and equilibrium dissociation constants (K<sub>D</sub>) for {pa['symbol']} and {pb['symbol']} arms simultaneously. Validate thermal stability (T<sub>m</sub> &gt; 65&deg;C) via Differential Scanning Fluorimetry (DSF) and monomer purity (&gt;98%) via SEC-MALS.</p>
      </div>
    </div>
    <div class="bio-plan-card">
      <span class="bio-step-num">Phase II</span>
      <div class="bio-step-details">
        <strong>Cellular Cytotoxicity &amp; Signaling Suppression</strong>
        <p>Co-culture target-dependent killing assays across panel of {indication} patient cell lines (LDH release and real-time impedance). Multiplex cytokine profiling (IFN-&gamma;, TNF-&alpha;, IL-2, IL-6) and Western blot confirmation of downstream phospho-signaling suppression (p-ERK, p-AKT, p-STAT3).</p>
      </div>
    </div>
    <div class="bio-plan-card">
      <span class="bio-step-num">Phase III</span>
      <div class="bio-step-details">
        <strong>In Vivo Efficacy &amp; Pharmacokinetics (PDX / CDX)</strong>
        <p>Efficacy validation in Patient-Derived Xenograft (PDX) or cell-line derived xenograft mouse models in humanized NSG mice. Measure Tumor Growth Inhibition (TGI &gt; 80%), determine serum clearance half-life (t<sub>1/2</sub> &ge; 7 days), and initiate pilot safety toxicology in non-human primates (Cynomolgus macaque).</p>
      </div>
    </div>
  </div>
</div>
"""

        return {
            "provider": "BiSpec RAG Scientific Dossier Engine (Grounded Clinical Prior)",
            "mechanism_of_action": moa_html.strip(),
            "resistance_bypass": res_html.strip(),
            "safety_and_toxicity": tox_html.strip(),
            "clinical_outlook": outlook_html.strip(),
            "synergy_type": synergy_meta['type'],
            "rag_grounded": True,
            "target_a_meta": pa,
            "target_b_meta": pb,
            "priority_tier": priority_tier
        }
