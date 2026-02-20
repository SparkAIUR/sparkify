from fastapi import FastAPI

app = FastAPI(title="Sparkify FastAPI Demo", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/users/{user_id}")
def get_user(user_id: str) -> dict[str, str]:
    return {"id": user_id}
