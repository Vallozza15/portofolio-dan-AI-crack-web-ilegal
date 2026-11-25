# Kali terminal image with authorized OpenSSH client support.
#
# The base image keeps every existing CTF tool and isolation setting. This
# derived layer ONLY adds the OpenSSH client and sshpass so the autonomous
# solver can connect from inside the existing per-session Kali container.
#
# Build:
#   docker build -t ctf-kali-remote:latest docker/ctf-kali-remote
#
# Then set CTF_TERMINAL_IMAGE=ctf-kali-remote:latest in .env.local.
FROM ctf-kali-sandbox:latest

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        openssh-client \
        sshpass \
        checksec \
        dwarf2json \
        radare2 \
        ghidra \
        hashcat \
    && python3 -m pip install --no-cache-dir --break-system-packages volatility3 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /root/.cache /tmp/*

USER analyst
WORKDIR /work
