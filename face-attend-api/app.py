import os
import base64
import numpy as np
import cv2
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from deepface import DeepFace
from supabase import create_client, Client
from dotenv import load_dotenv
from io import BytesIO
from PIL import Image
import requests
import sys

# Force UTF-8 encoding for Windows console to prevent UnicodeEncodeError
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") # Needed for DB updates

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Use asterisk for testing, then restrict
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model configuration
# Note: "Facenet" must be exactly this case for DeepFace
MODEL_NAME = "Facenet"
DETECTOR_BACKEND = "opencv"

@app.on_event("startup")
async def startup_event():
    """Warms up the model at startup to avoid delay on first request"""
    print(f"Warming up {MODEL_NAME} model for faster inference...")
    try:
        DeepFace.build_model(MODEL_NAME)
        print(f"{MODEL_NAME} model ready!")
    except Exception as e:
        print(f"Startup Warning: Model pre-loading failed: {str(e)}")

def decode_image(image_input: str):
    """Decodes base64 string OR fetches from URL to numpy array (RGB)"""
    try:
        # Check if it's a URL
        if image_input.startswith(("http://", "https://")):
            print(f"Fetching image from URL: {image_input}")
            response = requests.get(image_input)
            response.raise_for_status()
            img = Image.open(BytesIO(response.content)).convert('RGB')
        else:
            # Assume base64
            print("Decoding base64 image...")
            if "," in image_input:
                image_input = image_input.split(",")[1]
            img_data = base64.b64decode(image_input)
            img = Image.open(BytesIO(img_data)).convert('RGB')
        
        # Performance optimization: Resize for faster face detection
        # Facenet uses 160x160 internally, 480x480 is plenty for accurate detection
        MAX_SIZE = (480, 480)
        img.thumbnail(MAX_SIZE, Image.LANCZOS)
        
        return np.array(img)
    except requests.exceptions.ConnectionError as ce:
        print(f"Connection/DNS Error fetching image: {str(ce)}")
        raise HTTPException(status_code=400, detail=f"Server could not connect to storage provider (DNS/Network Error). Please try again or contact admin.")
    except Exception as e:
        print(f"Decode Error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid image data or URL: {str(e)}")

@app.post("/generate-embedding")
async def generate_embedding(user_id: str = Body(...), image: str = Body(...)):
    """Generates face embedding from image and saves to Supabase"""
    print(f"Generating embedding for user: {user_id} using model: {MODEL_NAME}")
    try:
        img_array = decode_image(image)
        
        # Generate embedding
        try:
            results = DeepFace.represent(
                img_path=img_array,
                model_name=MODEL_NAME,
                enforce_detection=True,
                detector_backend=DETECTOR_BACKEND
            )
        except ValueError as e:
            if "Face could not be detected" in str(e):
                print("Face detection failed with Enforce Detection. Retrying without it...")
                # Try without enforcement to see if we get anything, but ideally we want detection
                results = DeepFace.represent(
                    img_path=img_array,
                    model_name=MODEL_NAME,
                    enforce_detection=False,
                    detector_backend=DETECTOR_BACKEND
                )
            else:
                raise e
        
        if not results:
            print("No results from DeepFace")
            raise HTTPException(status_code=400, detail="No face detected in the image.")
            
        embedding = results[0]["embedding"]
        print(f"Embedding generated (length: {len(embedding)})")
        
        # Update Supabase profile
        print("Updating Supabase profile...")
        response = supabase.table("profiles").update({
            "face_embedding": embedding,
            "photo_status": "verified"
        }).eq("user_id", user_id).execute()
        
        if hasattr(response, 'error') and response.error:
            print(f"Supabase Error: {response.error}")
            raise HTTPException(status_code=500, detail=f"Supabase Update Error: {response.error}")

        print("Successfully updated profile.")
        return {"status": "success", "message": "Embedding generated and stored"}
        
    except HTTPException as he:
        raise he
    except Exception as e:
        import traceback
        error_msg = f"Unexpected Error: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/verify-face")
async def verify_face(user_id: str = Body(...), image: str = Body(...)):
    """Verifies live face capture against stored embedding"""
    print(f"Verifying face for user: {user_id}")
    try:
        # 1. Fetch stored embedding
        profile_response = supabase.table("profiles").select("face_embedding").eq("user_id", user_id).single().execute()
        
        if not profile_response.data or not profile_response.data.get("face_embedding"):
            raise HTTPException(status_code=404, detail="Face embedding not found for this user. Please ask admin to verify your photo first.")
            
        raw_embedding = profile_response.data["face_embedding"]
        
        # Supabase pgvector might return a string like "[0.1, 0.2, ...]" or a list
        if isinstance(raw_embedding, str):
            import json
            print("Converting string embedding to list...")
            stored_embedding = np.array(json.loads(raw_embedding), dtype=float)
        else:
            stored_embedding = np.array(raw_embedding, dtype=float)
            
        print(f"Stored embedding loaded. Shape: {stored_embedding.shape}, Dtype: {stored_embedding.dtype}")
        
        # 2. Generate new embedding from capture
        img_array = decode_image(image)
        try:
            results = DeepFace.represent(
                img_path=img_array,
                model_name=MODEL_NAME,
                enforce_detection=True,
                detector_backend=DETECTOR_BACKEND
            )
        except ValueError as e:
            if "Face could not be detected" in str(e):
                print("Face detection failed in live capture. Retrying without enforcement...")
                results = DeepFace.represent(
                    img_path=img_array,
                    model_name=MODEL_NAME,
                    enforce_detection=False,
                    detector_backend=DETECTOR_BACKEND
                )
            else:
                raise e

        if not results:
            raise HTTPException(status_code=400, detail="No face detected in live capture. Please ensure your face is clearly visible.")
            
        live_embedding = np.array(results[0]["embedding"], dtype=float)
        print(f"Live embedding generated. Shape: {live_embedding.shape}, Dtype: {live_embedding.dtype}")
        
        # 3. Calculate Cosine Similarity
        # Ensure both are 1D arrays of same size
        if stored_embedding.shape != live_embedding.shape:
            print(f"Shape mismatch! Stored: {stored_embedding.shape}, Live: {live_embedding.shape}")
            raise HTTPException(status_code=500, detail="Stored face data format mismatch. Please re-verify student photo.")

        similarity = np.dot(stored_embedding, live_embedding) / (np.linalg.norm(stored_embedding) * np.linalg.norm(live_embedding))
        
        # Threshold for FaceNet
        MATCH_THRESHOLD = 0.65
        is_match = bool(similarity >= MATCH_THRESHOLD)
        
        print(f"Verification result: {is_match} (Confidence: {similarity:.4f})")
        
        return {
            "match": is_match,
            "confidence": float(similarity),
            "status": "success"
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        import traceback
        print(f"Verification Error: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
