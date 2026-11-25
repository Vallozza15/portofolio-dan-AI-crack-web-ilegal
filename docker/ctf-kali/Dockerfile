# CTF Intelligence — Kali Linux analysis sandbox.
#
# The container is intentionally isolated: no network by default, read-only
# root filesystem, all capabilities dropped, non-root user, and only /tmp,
# /work, /analysis are writable tmpfs mounts supplied at runtime.
#
# Build:
#   docker build -t ctf-kali-sandbox:latest docker/ctf-kali
FROM kalilinux/kali-rolling

ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/tmp \
    LANG=C.UTF-8 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      file \
      binutils \
      xxd \
      binwalk \
      foremost \
      sleuthkit \
      libimage-exiftool-perl \
      pngcheck \
      poppler-utils \
      tshark \
      tcpdump \
      nmap \
      netcat-traditional \
      curl \
      wget \
      git \
      openssl \
      zip \
      unzip \
      p7zip-full \
      imagemagick \
      ffmpeg \
      sox \
      zbar-tools \
      python3 \
      python3-pip \
      ruby \
      ruby-dev \
      build-essential \
      gdb \
      strace \
      steghide \
      john \
      wordlists \
      less \
      vim-tiny \
      jq \
    && gem install --no-document zsteg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /root/.cache /tmp/*

RUN useradd --create-home --uid 1000 --shell /bin/bash analyst \
    && mkdir -p /analysis /work \
    && chown analyst:analyst /analysis /work

USER analyst
WORKDIR /work

CMD ["sleep", "infinity"]
