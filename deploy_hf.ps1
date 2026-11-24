<#
.SYNOPSIS
  One-click uploader to deploy BiSpec Pairwise AI directly to a Hugging Face Space (Docker SDK)
  with ZERO GitHub repository required and automatic exclusion of secrets (.env) and large temp files.
.EXAMPLE
  .\deploy_hf.ps1 -RepoId "your-hf-username/bispec-ai" -Token "hf_xxxxxxxxx"
#>
param(
  [Parameter(Mandatory=$true)][string]$RepoId,
  [Parameter(Mandatory=$true)][string]$Token
)

$ErrorActionPreference = "Stop"
$PythonExe = if (Test-Path "C:\Python314\python.exe") { "C:\Python314\python.exe" } else { "python" }

Write-Host "Ensuring huggingface_hub is installed..." -ForegroundColor Cyan
& $PythonExe -m pip install -q --upgrade huggingface_hub

$PyCode = @"
from huggingface_hub import HfApi
api = HfApi(token='$Token')
print('Uploading clean BiSpec Pairwise AI workspace to Space: $RepoId ...')
api.upload_folder(
    folder_path='.',
    repo_id='$RepoId',
    repo_type='space',
    ignore_patterns=[
        '.git/*', '.git/**',
        '.env',
        '.vscode/*', '.vscode/**', '.vscode.zip',
        'node_modules/*', 'node_modules/**',
        'dist/*', 'dist/**',
        '__pycache__/*', '**/__pycache__/**', '*.pyc',
        'users_history.db',
        'FrameDemo.java', 'Untitled-1.java',
        'unslop/*', 'unslop/**',
        'skills/*', 'skills/**',
        'base papers/*', 'base papers/**',
        '*.pptx', '*.log',
    ],
    commit_message='Deploy BiSpec Pairwise AI (Sky & Coral UI + 95.06% Clinical Safe Ensemble + RAG)'
)
print('DONE! Your Space is now building at: https://huggingface.co/spaces/$RepoId')
"@

& $PythonExe -c $PyCode
