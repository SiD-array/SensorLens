import os
import uuid
import json
import numpy as np
import pandas as pd
from typing import Dict, List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import starlette.formparsers
# Increase multipart parser field and spool limits from 1MB to 100MB
# so large baseline profile JSON payloads and high-channel files are never restricted
starlette.formparsers.MultiPartParser.max_part_size = 100 * 1024 * 1024  # 100MB
starlette.formparsers.MultiPartParser.spool_max_size = 100 * 1024 * 1024 # 100MB

import similarity
from app.services.alignment import match_columns_lexical
from app.api.endpoints.baseline import router as baseline_router

app = FastAPI(title="SensorLens API")

# Configure CORS so the React frontend can communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount baseline and alignment endpoints
app.include_router(baseline_router, prefix="/api")

# Global in-memory cache to store uploaded datasets during session
# key: file_id -> { "name": str, "df": pd.DataFrame, "metadata": dict }
uploaded_files_cache: Dict[str, dict] = {}

class MappingRequest(BaseModel):
    ref_cols: List[str]
    test_cols: List[str]

class AnalyzeRequest(BaseModel):
    ref_file_id: str
    test_file_id: str
    mappings: Dict[str, str]  # ref_col -> test_col
    thresholds: Dict[str, float]  # {"match": 0.85, "similar": 0.60}
    weights: Dict[str, float]  # {"pearson": 0.5, "dtw": 0.5}
    api_key: Optional[str] = None

class FeedbackRequest(BaseModel):
    report_id: str
    col_name: str
    verdict: str  # "correct" or "incorrect"
    comment: Optional[str] = None

class WorkspaceState(BaseModel):
    files: List[dict]  # List of file info including columns metadata
    tags: Dict[str, str]  # file_id -> tag ("useful", "reviewable", "reference", "archive")
    mappings: Dict[str, str]
    saved_reports: List[dict]

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Ingests an Excel (.xlsx, .xls) or CSV (.csv) file. Validates its structure
    and extracts columns, metadata, and downsampled sparkline array for each sensor.
    """
    filename_lower = file.filename.lower()
    if not (filename_lower.endswith(('.xlsx', '.xls', '.csv'))):
        raise HTTPException(status_code=400, detail="Only Excel (.xlsx, .xls) and CSV (.csv) files are supported.")
    
    file_id = str(uuid.uuid4())
    
    try:
        if filename_lower.endswith('.csv'):
            df = pd.read_csv(file.file)
        else:
            df = pd.read_excel(file.file)
        
        if df.empty:
            raise HTTPException(status_code=400, detail=f"The uploaded file '{file.filename}' is empty.")
        
        # Clean columns (convert to string and strip)
        df.columns = [str(col).strip() for col in df.columns]
        
        # We will parse columns and construct metadata
        columns_metadata = []
        
        for col in df.columns:
            series = df[col]
            total_rows = len(series)
            
            # Check for missing values
            missing_count = int(series.isna().sum())
            
            # Check data type
            # Try to coerce to numeric if it's not already
            numeric_series = pd.to_numeric(series, errors='coerce')
            non_numeric_count = int(numeric_series.isna().sum() - missing_count)
            
            # If a column is mostly numeric (less than 15% non-numeric elements), treat as numeric
            is_numeric = (total_rows - missing_count - non_numeric_count) > 0.85 * (total_rows - missing_count)
            
            if is_numeric:
                clean_series = numeric_series.dropna()
                if len(clean_series) > 0:
                    c_min = float(clean_series.min())
                    c_max = float(clean_series.max())
                    c_mean = float(clean_series.mean())
                    c_std = float(clean_series.std()) if len(clean_series) > 1 else 0.0
                    col_type = "numeric"
                    
                    # Generate 30 downsampled points for the sparkline preview
                    sparkline_pts = similarity.interpolate_series(clean_series.values, 30).tolist()
                else:
                    c_min, c_max, c_mean, c_std = 0.0, 0.0, 0.0, 0.0
                    col_type = "empty_numeric"
                    sparkline_pts = []
            else:
                c_min, c_max, c_mean, c_std = 0.0, 0.0, 0.0, 0.0
                col_type = "categorical"
                sparkline_pts = []
                
            columns_metadata.append({
                "name": col,
                "type": col_type,
                "total_rows": total_rows,
                "missing_count": missing_count,
                "min": c_min,
                "max": c_max,
                "mean": c_mean,
                "std": c_std,
                "sparkline": sparkline_pts
            })
            
        # Store in-memory
        uploaded_files_cache[file_id] = {
            "id": file_id,
            "name": file.filename,
            "df": df,
            "columns": columns_metadata
        }
        
        return {
            "id": file_id,
            "name": file.filename,
            "columns": columns_metadata,
            "rowCount": len(df)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse Excel file: {str(e)}")

@app.post("/api/suggest-mapping")
async def suggest_mapping_endpoint(req: MappingRequest):
    """
    Computes deterministic lexical auto-suggestions for mapping (Stage 1).
    Strikes delimiters, engineering units, and applies Levenshtein threshold.
    """
    lex_result = match_columns_lexical(req.ref_cols, req.test_cols, threshold=0.85)
    return {
        "suggestions": lex_result["mapping_dict"],
        "matches": lex_result["matches"],
        "unassigned_ref": lex_result["unassigned_ref"],
        "unassigned_test": lex_result["unassigned_test"]
    }

@app.post("/api/analyze")
async def analyze_similarity(req: AnalyzeRequest):
    """
    Calculates detailed pattern similarity between Reference and Test datasets.
    """
    ref_id = req.ref_file_id
    test_id = req.test_file_id
    
    if ref_id not in uploaded_files_cache:
        raise HTTPException(status_code=404, detail="Reference file not found in cache.")
    if test_id not in uploaded_files_cache:
        raise HTTPException(status_code=404, detail="Test file not found in cache.")
        
    ref_data = uploaded_files_cache[ref_id]
    test_data = uploaded_files_cache[test_id]
    
    ref_df = ref_data["df"]
    test_df = test_data["df"]
    
    results = {}
    
    match_threshold = req.thresholds.get("match", 0.85)
    similar_threshold = req.thresholds.get("similar", 0.60)
    
    w_pearson = req.weights.get("pearson", 0.5)
    w_dtw = req.weights.get("dtw", 0.5)
    
    for ref_col, test_col in req.mappings.items():
        if not test_col or ref_col not in ref_df.columns or test_col not in test_df.columns:
            continue
            
        try:
            # Extract series and coerce to numeric
            s_ref = pd.to_numeric(ref_df[ref_col], errors='coerce').dropna().values
            s_test = pd.to_numeric(test_df[test_col], errors='coerce').dropna().values
            
            if len(s_ref) == 0 or len(s_test) == 0:
                results[ref_col] = {
                    "mapped_to": test_col,
                    "error": "One of the columns has no numeric data."
                }
                continue
            
            # Compute stats
            scores = similarity.compute_similarity(s_ref, s_test)
            pearson = scores["pearson"]
            dtw = scores["dtw"]
            
            hybrid = w_pearson * pearson + w_dtw * dtw
            
            # Category selection
            if hybrid >= match_threshold:
                category = "match"
            elif hybrid >= similar_threshold:
                category = "similar"
            else:
                category = "no match"
                
            # Time lag & Peak comparison
            lag = similarity.detect_time_lag(s_ref, s_test)
            peaks_info = similarity.find_peaks_and_compare(s_ref, s_test)
            
            # Generate local engineering report
            report_text = similarity.generate_local_report(
                ref_col=ref_col,
                test_col=test_col,
                hybrid_score=hybrid,
                pearson_score=pearson,
                dtw_score=dtw,
                lag=lag,
                peaks_info=peaks_info,
                category=category
            )
            
            # If user has configured Gemini API key, try using it
            if req.api_key:
                try:
                    import google.generativeai as genai
                    genai.configure(api_key=req.api_key)
                    model = genai.GenerativeModel('gemini-1.5-flash')
                    
                    prompt = (
                        f"You are a BSH appliance engineering expert analyzing sensor test data. "
                        f"Please write a short, professional, plain-language engineering summary explaining "
                        f"why these two sensor signals match or differ based on these calculated metrics:\n"
                        f"- Reference Sensor: {ref_col}, Test Sensor: {test_col}\n"
                        f"- Similarity Level: {category.upper()} (Overall hybrid score: {hybrid:.1%})\n"
                        f"- Wave shape agreement (Pearson): {pearson:.1%}\n"
                        f"- Time-stretched shape agreement (DTW): {dtw:.1%}\n"
                        f"- Starting lag (offset): {lag} indices (approx {lag} seconds)\n"
                        f"- Peaks: Ref has {peaks_info['peaks_ref']} peaks (max {peaks_info['max_ref']:.2f}); "
                        f"Test has {peaks_info['peaks_test']} peaks (max {peaks_info['max_test']:.2f}, "
                        f"tallest peak reached {peaks_info['tallest_peak_test']:.2f}).\n\n"
                        f"Ensure the report is brief, technical, grounded ONLY in these metrics, "
                        f"explains physical differences (like starting delays or peak discrepancies), "
                        f"and gives feedback on whether this test run is acceptable or needs review. "
                        f"Avoid general pleasantries."
                    )
                    
                    response = model.generate_content(prompt)
                    if response.text:
                        report_text = response.text.strip()
                except Exception as ex:
                    # Fallback to local report if Gemini call fails
                    report_text = f"*(AI fallback due to API error: {str(ex)})* \n\n" + report_text
            
            # Downsample actual data arrays to 200 points for frontend rendering to prevent UI lag
            ref_plot_data = similarity.interpolate_series(s_ref, 200).tolist()
            test_plot_data = similarity.interpolate_series(s_test, 200).tolist()
            
            results[ref_col] = {
                "mapped_to": test_col,
                "score": hybrid,
                "pearson": pearson,
                "dtw": dtw,
                "category": category,
                "confidence": hybrid, # Confidence linked to hybrid score
                "lag": lag,
                "peaks_ref": peaks_info["peaks_ref"],
                "peaks_test": peaks_info["peaks_test"],
                "max_ref": peaks_info["max_ref"],
                "max_test": peaks_info["max_test"],
                "explanation": report_text,
                "plot_data": {
                    "ref": ref_plot_data,
                    "test": test_plot_data
                }
            }
        except Exception as e:
            results[ref_col] = {
                "mapped_to": test_col,
                "error": f"Similarity calculation failed: {str(e)}"
            }
            
    return {"results": results}

@app.post("/api/workspace/export-one-drive")
async def export_workspace_one_drive(req: dict):
    """
    Saves a report locally to a target directory. If it represents a synced OneDrive
    directory, it automatically updates there.
    """
    one_drive_path = req.get("path", "")
    session_data = req.get("session", {})
    
    if not one_drive_path:
        raise HTTPException(status_code=400, detail="Path parameter is required.")
        
    try:
        # Resolve user folder paths like ~ or env expansions
        resolved_path = os.path.expanduser(os.path.expandvars(one_drive_path))
        
        # Create directory if it doesn't exist
        os.makedirs(resolved_path, exist_ok=True)
        
        filename = f"sensorlens_workspace_{uuid.uuid4().hex[:8]}.json"
        full_filepath = os.path.join(resolved_path, filename)
        
        # Write JSON session file
        with open(full_filepath, "w") as f:
            json.dump(session_data, f, indent=2)
            
        # Write a clean markdown summary report file that the OneDrive AI can index
        md_filename = filename.replace(".json", "_report.md")
        md_filepath = os.path.join(resolved_path, md_filename)
        
        # Construct MD content
        md_content = f"# SensorLens Test Assessment Report\n\n"
        md_content += f"**Export Timestamp**: {pd.Timestamp.now().isoformat()}\n\n"
        md_content += f"## Operational Summary\n"
        
        saved_reports = session_data.get("saved_reports", [])
        if saved_reports:
            for rep in saved_reports:
                md_content += f"### Test Run: {rep.get('test_file_name', 'Unnamed')} (vs Reference: {rep.get('ref_file_name', 'Unnamed')})\n"
                md_content += f"- **Overall verdict**: {rep.get('verdict', 'N/A')}\n"
                md_content += f"- **Feedback tag**: {rep.get('tag', 'N/A')}\n"
                md_content += f"- **Column Analysis**:\n"
                for col_name, col_res in rep.get("results", {}).items():
                    if "error" in col_res:
                        continue
                    md_content += f"  - **{col_name} -> {col_res.get('mapped_to')}**:\n"
                    md_content += f"    - Similarity Score: {col_res.get('score', 0):.1%}\n"
                    md_content += f"    - Category: {col_res.get('category', '').upper()}\n"
                    md_content += f"    - Explanation: {col_res.get('explanation', '')}\n\n"
        else:
            md_content += "No computed similarity analyses in this workspace session yet.\n"
            
        with open(md_filepath, "w") as f:
            f.write(md_content)
            
        return {
            "status": "success",
            "saved_json": full_filepath,
            "saved_markdown": md_filepath
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export files to the target directory: {str(e)}")

@app.post("/api/workspace/import-session")
async def import_workspace_session(state: dict):
    """
    Imports and reconstructs files into the backend in-memory cache.
    """
    files = state.get("files", [])
    
    # Reload files dataframes into the local memory cache so analyze works
    for f in files:
        file_id = f.get("id")
        name = f.get("name")
        columns = f.get("columns", [])
        
        # If the file has data table, recreate dataframe
        # In a workspace export, we save dataframe row objects to avoid losing data
        raw_rows = f.get("rawData", [])
        if raw_rows:
            df = pd.DataFrame(raw_rows)
        else:
            df = pd.DataFrame()
            
        uploaded_files_cache[file_id] = {
            "id": file_id,
            "name": name,
            "df": df,
            "columns": columns
        }
        
    return {"status": "success", "fileCount": len(uploaded_files_cache)}

@app.post("/api/feedback")
async def log_feedback(req: FeedbackRequest):
    """
    Logs user judgment feedback to help calibrate similarity thresholds.
    """
    feedback_log_path = "similarity_feedback_log.jsonl"
    try:
        feedback_entry = {
            "timestamp": pd.Timestamp.now().isoformat(),
            "report_id": req.report_id,
            "col_name": req.col_name,
            "verdict": req.verdict,
            "comment": req.comment
        }
        with open(feedback_log_path, "a") as f:
            f.write(json.dumps(feedback_entry) + "\n")
            
        return {"status": "success", "message": "Feedback logged successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to log feedback: {str(e)}")
