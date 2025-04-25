FROM ubuntu/nginx

# python ----------------------------------------------------------
ENV PYTHONUNBUFFERED=1
RUN apt update && apt -y install curl vim supervisor python3 python3-pip python3-flask python3-flask-restful python3-flask-cors python3-requests python3-tables python3-blosc gunicorn
RUN pip3 install --break-system-packages --no-cache openmatrix
RUN pip3 install --break-system-packages --no-cache azure-storage-blob

# azure-storage-fuse // release 2.4.1
RUN apt -y install wget fuse3 libfuse3-dev
RUN wget https://github.com/Azure/azure-storage-fuse/releases/download/blobfuse2-2.4.1/blobfuse2-2.4.1-Ubuntu-22.04.x86_64.deb
RUN dpkg -i blobfuse2-2.4.1-Ubuntu-22.04.x86_64.deb

# nginx -----------------------------------------------------------
RUN service nginx stop
RUN rm /etc/nginx/sites-enabled/default
COPY nginx.conf /etc/nginx/sites-enabled/omx-service.conf
EXPOSE 80

# Supervisor (multi-process docker) -------------------------------
COPY supervisord.conf /etc/supervisor/conf.d/

# App configuration
WORKDIR /app
COPY . /app

# Mount azure blob storage
RUN blobfuse2 mount /app/data --read-only=true --config /app/blobfuse-dev.yaml

# Supervisor config runs both nginx and gunicorn/flask: -----------
CMD /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
