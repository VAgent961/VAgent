# Build context = repo root (see docker-compose.yml). All tools are free/open source.
FROM python:3.11-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl fontconfig && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir kokoro-onnx==0.6.1 playwright==1.65.2 tzdata && playwright install --with-deps chromium
RUN mkdir -p /models /usr/share/fonts/vagent \
 && M=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0 \
 && curl -fsSL -o /models/kokoro-v1.0.onnx $M/kokoro-v1.0.onnx && curl -fsSL -o /models/voices-v1.0.bin $M/voices-v1.0.bin \
 && F=https://raw.githubusercontent.com/google/fonts/main/ofl \
 && curl -fsSL -o /usr/share/fonts/vagent/Newsreader.ttf "$F/newsreader/Newsreader%5Bopsz%2Cwght%5D.ttf" \
 && curl -fsSL -o /usr/share/fonts/vagent/Inter.ttf "$F/inter/Inter%5Bopsz%2Cwght%5D.ttf" && fc-cache -f
WORKDIR /app/tools/marketing-render
COPY assets/char /app/assets/char
COPY assets/brand /app/assets/brand
COPY tools/marketing-render ./
ENV ASSETS=/app/assets PYTHONDONTWRITEBYTECODE=1
ENTRYPOINT ["python", "worker.py"]
