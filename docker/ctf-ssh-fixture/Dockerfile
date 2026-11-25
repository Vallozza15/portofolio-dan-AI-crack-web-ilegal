FROM python:3.13-slim

RUN pip install --no-cache-dir paramiko==3.0.0

COPY server.py /opt/ctf-ssh-fixture/server.py
WORKDIR /opt/ctf-ssh-fixture
EXPOSE 2222

CMD ["python3", "server.py"]
