"""Bounded SSH fixture used only by the autonomous acceptance suite.

It emulates a small two-stage challenge filesystem. It never executes any
command received from the client; it only returns canned, test-owned strings.
"""
from __future__ import annotations

import base64
import hashlib
import os
import re
import socket
import struct
import threading
import time
from pathlib import Path

import paramiko
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

USER = os.environ.get("CTF_FIXTURE_USER", "ctf")
PASSWORD = os.environ.get("CTF_FIXTURE_PASSWORD", "ctftest")
FLAG = os.environ.get("CTF_FIXTURE_FLAG", "flag{real_test_flag_123}")
ROT13_HINT = os.environ.get(
    "CTF_FIXTURE_HINT",
    "Ubg tfgntr 1. Ernq fgntr2.gkg sbe gur arkg fgntr.",
)
PORT = int(os.environ.get("CTF_FIXTURE_PORT", "2222"))
KEY_PATH = "/tmp/ctf_fixture_host_key"
FINGERPRINT_PATH = "/tmp/ctf_fixture_fingerprint"


HOST_KEY_NUMBERS: tuple[int, int] | None = None


def prepare_host_key() -> paramiko.PKey:
    global HOST_KEY_NUMBERS
    if os.path.exists(KEY_PATH):
        crypto_key = serialization.load_pem_private_key(
            Path(KEY_PATH).read_bytes(), password=None
        )
    else:
        crypto_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        Path(KEY_PATH).write_bytes(
            crypto_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
        os.chmod(KEY_PATH, 0o600)
    numbers = crypto_key.public_key().public_numbers()
    HOST_KEY_NUMBERS = (numbers.e, numbers.n)
    return paramiko.RSAKey(key=crypto_key)


def ssh_string(value: bytes) -> bytes:
    return struct.pack(">I", len(value)) + value


def ssh_mpint(value: int) -> bytes:
    raw = value.to_bytes((value.bit_length() + 7) // 8 or 1, "big")
    if raw[0] & 0x80:
        raw = b"\x00" + raw
    return ssh_string(raw)


def public_fingerprint() -> str:
    if HOST_KEY_NUMBERS is None:
        raise RuntimeError("Host key belum disiapkan.")
    exponent, modulus = HOST_KEY_NUMBERS
    # SSH wire format for an RSA public key: string "ssh-rsa", mpint e, mpint n.
    blob = ssh_string(b"ssh-rsa") + ssh_mpint(exponent) + ssh_mpint(modulus)
    return base64.b64encode(hashlib.sha256(blob).digest()).decode("ascii").rstrip("=")


def command_output(command: str) -> str:
    if "__CTF_SSH_OK__" in command:
        return "__CTF_SSH_OK__\n"
    if re.search(r"stage2\.txt", command):
        return f"-rw-r--r-- 1 {USER} {USER} 32 Jan  1 00:00 stage2.txt\n{FLAG}\n"
    if re.search(r"hint|grep|ls|pwd|find|cat|printf", command, re.IGNORECASE):
        return "\n".join(
            [
                "/home/ctf",
                "total 16",
                f"-rw-r--r-- 1 {USER} {USER} 120 Jan  1 00:00 hint.txt",
                f"-rw-r--r-- 1 {USER} {USER} 32 Jan  1 00:00 stage2.txt",
                ROT13_HINT,
                "",
            ]
        )
    return "(no output)\n"


class FixtureServer(paramiko.ServerInterface):
    def __init__(self, host_key: paramiko.PKey) -> None:
        self.host_key = host_key
        self.event = threading.Event()
        self.command = ""

    def get_allowed_auths(self, username: str) -> str:
        return "password"

    def check_auth_password(self, username: str, password: str) -> int:
        if username == USER and password == PASSWORD:
            return paramiko.AUTH_SUCCESSFUL
        return paramiko.AUTH_FAILED

    def check_channel_request(self, kind: str, chanid: int) -> int:
        if kind == "session":
            return paramiko.OPEN_SUCCEEDED
        return paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED

    def check_channel_exec_request(self, channel: paramiko.Channel, command: bytes) -> bool:
        self.command = command.decode("utf-8", "replace")
        self.event.set()
        return True


def handle(client: socket.socket, host_key: paramiko.PKey) -> None:
    transport = paramiko.Transport(client)
    transport.add_server_key(host_key)
    server = FixtureServer(host_key)
    try:
        transport.start_server(server=server)
        channel = transport.accept(10)
        if channel is None:
            return
        server.event.wait(10)
        if server.event.is_set():
            channel.sendall(command_output(server.command))
        channel.send_exit_status(0)
        channel.close()
        time.sleep(0.2)
    except Exception:
        pass
    finally:
        try:
            transport.close()
        except Exception:
            pass
        try:
            client.close()
        except Exception:
            pass


def main() -> None:
    host_key = prepare_host_key()
    with open(FINGERPRINT_PATH, "w", encoding="ascii") as fingerprint_file:
        fingerprint_file.write(public_fingerprint())
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("0.0.0.0", PORT))
    listener.listen(32)
    print(f"CTF_SSH_FIXTURE_READY port={PORT}", flush=True)
    while True:
        client, _ = listener.accept()
        threading.Thread(target=handle, args=(client, host_key), daemon=True).start()


if __name__ == "__main__":
    main()
