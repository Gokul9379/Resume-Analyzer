import io
import logging
import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Literal
from langchain_google_genai import ChatGoogleGenerativeAI
import pdfplumber

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("resume-analyzer")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024  # 8 MB
MAX_RESUME_CHARS = 15_000  # keep prompts well inside context / cost limits
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

if not (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")):
    # Fail fast and loudly rather than surfacing a confusing 500 on first request.
    logger.warning(
        "No GOOGLE_API_KEY / GEMINI_API_KEY found in the environment. "
        "Set one in your .env file before making requests."
    )

app = FastAPI(title="AI Resume Summarizer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your frontend's origin(s) before deploying
    allow_methods=["POST"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
class ImprovementArea(BaseModel):
    area: str = Field(
        description="Short name of the weakness or gap, e.g. 'Quantified impact' or 'ATS keyword coverage'"
    )
    priority: Literal["High", "Medium", "Low"] = Field(
        description="How much this is likely holding the candidate back from getting selected — "
        "High = fix before applying, Medium = worth fixing, Low = minor polish"
    )
    why_it_matters: str = Field(
        description="1-2 sentences on why this could hurt them at the screening or interview stage"
    )
    fix: str = Field(
        description="A concrete, specific action the candidate can take to fix this — not generic advice"
    )


class ResumeSummary(BaseModel):
    name: str = Field(description="Candidate's full name as written on the resume")
    email: str = Field(description="Candidate's email address, or 'Not provided' if absent")
    years_of_experience: int = Field(
        ge=0, le=60,
        description="Total combined years of professional experience, rounded to the nearest whole year",
    )
    top_skills: list[str] = Field(
        min_length=1, max_length=5,
        description="Up to 5 of the candidate's strongest technical or professional skills, most relevant first",
    )
    professional_summary: str = Field(description="A 3-sentence summary of the candidate's career and strengths")
    match_score: Optional[int] = Field(
        default=None, ge=0, le=100,
        description="Score from 0-100 indicating how well the candidate matches the job description. Null if no job description is provided.",
    )
    improvement_areas: list[ImprovementArea] = Field(
        min_length=2, max_length=5,
        description="2-5 concrete weaknesses/gaps in the resume, ordered by priority (High first), "
        "each with a specific fix that would help the candidate get selected faster",
    )


llm = ChatGoogleGenerativeAI(model=GEMINI_MODEL, temperature=0)
structured_llm = llm.with_structured_output(ResumeSummary)


# ---------------------------------------------------------------------------
# PDF extraction
# ---------------------------------------------------------------------------
def extract_text_from_pdf(file_bytes: bytes) -> str:
    text_parts = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                extracted = page.extract_text()
                if extracted:
                    text_parts.append(extracted)
    except Exception as e:
        logger.exception("Failed to parse PDF")
        raise ValueError(f"Failed to parse PDF: {str(e)}")
    return "\n".join(text_parts)


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------
def build_prompt(resume_text: str, job_description: Optional[str]) -> str:
    """Builds the extraction prompt, adapting instructions based on whether a
    job description was supplied."""

    if job_description:
        jd_block = f"\nJOB DESCRIPTION:\n\"\"\"\n{job_description.strip()}\n\"\"\"\n"
        scoring_rubric = """
5. Match score (0-100): Score strictly against the JOB DESCRIPTION above using this rubric:
   - Required skills / technologies present in both the resume and the job description (heaviest weight)
   - Years of relevant experience versus what the role appears to require
   - Domain / industry overlap
   - Seniority and scope of past responsibilities versus the role's level
   Do not give credit for skills or experience that only appear in the job description but not the resume.
   Be strict and realistic - a generic or loosely related resume should score low (below 50), and only a
   strong, well-aligned candidate should score above 80. Output a single integer, no explanation."""
        skills_instruction = (
            "Identify up to 5 of the candidate's strongest skills, prioritizing the ones most relevant "
            "to the job description, in order of relevance."
        )
        summary_instruction = (
            "Write a 3-sentence executive summary that highlights the aspects of the candidate's "
            "background most relevant to the job description above."
        )
        improvement_instruction = """
6. Improvement areas (2-5): Compare the resume against the JOB DESCRIPTION and identify the gaps most likely
   to cause this candidate to be screened out or to lose points in an interview for THIS role. For each one give:
   - area: a short label for the gap
   - priority: High/Medium/Low based on how much it's likely hurting their chances against this specific role
   - why_it_matters: why a recruiter or interviewer for this role would care
   - fix: one concrete, specific action - not generic advice like "add more skills". Reference missing keywords,
     unquantified bullet points, missing required experience, weak positioning, etc. where relevant.
   Order the list with the highest-priority item first."""
    else:
        jd_block = ""
        scoring_rubric = "\n5. Match score: No job description was provided, so set this field to null."
        skills_instruction = (
            "Identify up to 5 of the candidate's strongest technical or professional skills, "
            "in order of overall strength. Ignore generic soft skills (e.g. 'communication', 'teamwork')."
        )
        summary_instruction = "Write a 3-sentence executive summary of the candidate's career and strengths."
        improvement_instruction = """
6. Improvement areas (2-5): Identify the gaps in this resume most likely to cause a candidate to be screened
   out or lose points in an interview generally (e.g. missing metrics/impact, vague bullet points, formatting
   issues implied by the text, unclear scope of ownership, missing dates, weak summary framing). For each one give:
   - area: a short label for the gap
   - priority: High/Medium/Low based on how much it's likely hurting this candidate's chances
   - why_it_matters: why a recruiter or interviewer would care about this
   - fix: one concrete, specific action - not generic advice like "add more skills".
   Order the list with the highest-priority item first."""

    return f"""You are an expert executive recruiter and data analyst. Analyze the raw resume text below and
extract an accurate, evidence-based professional profile. Base every field strictly on what is stated or can
be directly inferred from the resume text - never invent details, employers, dates, or skills that are not
present in the source text.

Follow these extraction rules:
1. Name & email: Extract exactly as written. If several emails appear, choose the one that reads as
   primary/professional. If no email is present, use "Not provided".
2. Years of experience: Sum the candidate's professional (non-internship, non-academic) roles based on the
   dates given. If dates are missing or ambiguous, make a conservative, reasonable estimate rather than
   guessing wildly, and round to the nearest whole year.
3. Top skills: {skills_instruction}
4. Professional summary: {summary_instruction}
{scoring_rubric}
{improvement_instruction}

RESUME TEXT:
\"\"\"
{resume_text}
\"\"\"
{jd_block}"""


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "model": GEMINI_MODEL}


@app.post("/upload-resume/", response_model=ResumeSummary)
async def summarize_resume(
    file: UploadFile = File(...),
    job_description: Optional[str] = Form(None),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    if file.content_type not in ("application/pdf", "application/x-pdf"):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid PDF.")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File is too large. Max size is {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB.",
        )

    try:
        raw_text = extract_text_from_pdf(contents)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not raw_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from the PDF. It may be a scanned image without a text layer.",
        )

    if len(raw_text) > MAX_RESUME_CHARS:
        logger.info("Truncating resume text from %d to %d chars", len(raw_text), MAX_RESUME_CHARS)
        raw_text = raw_text[:MAX_RESUME_CHARS]

    jd = job_description.strip() if job_description and job_description.strip() else None
    prompt = build_prompt(raw_text, jd)

    try:
        result = structured_llm.invoke(prompt)
    except Exception as e:
        logger.exception("AI processing failed")
        raise HTTPException(status_code=502, detail=f"AI processing failed: {str(e)}")

    return result