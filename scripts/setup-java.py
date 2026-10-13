#!/usr/bin/env python3
"""Prepare Java 17 for React Native's pinned Kotlin/Gradle toolchain.

Reuse an explicitly supplied Java 17 JDK, or install the pinned Microsoft build
into /workspace/.jdks. Downloads use TLS verification. The Microsoft signing
key fingerprint, signed InRelease, package-index checksum, and pinned DEB
checksum are verified before extraction. No system packages or trust stores
are changed. --print-home emits only the selected JDK path on stdout.
"""

import argparse
import gzip
import hashlib
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile


FINGERPRINT = "BC528686B50D79E339D3721CEB3E94ADBE1229CF"
KEY_URL = "https://packages.microsoft.com/keys/microsoft.asc"
REPOSITORY = "https://packages.microsoft.com/repos/microsoft-debian-bookworm-prod/"
VERSION = "17.0.20.1-1"
PACKAGE_PATH = "pool/main/m/msopenjdk-17/msopenjdk-17_17.0.20.1-1_amd64.deb"
PACKAGE_SHA256 = "264b078dae839511d08b285957667d18c5bec5e3b17b79e34b7f0bcf4853a855"
PACKAGE_SIZE = 165022818
INDEX_PATH = "main/binary-amd64/Packages.gz"
JDK_DIRECTORY = "msopenjdk-17.0.20.1"
JDK_RELATIVE_HOME = Path("usr/lib/jvm/msopenjdk-17-amd64")


def log(message):
    print(message, file=sys.stderr, flush=True)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download(url, target):
    if target.exists():
        return
    descriptor, temporary_name = tempfile.mkstemp(prefix=target.name + ".", suffix=".part", dir=target.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        subprocess.run([
            "curl", "--fail", "--silent", "--show-error", "--location",
            "--proto", "=https", "--tlsv1.2", "--output", str(temporary), url,
        ], check=True)
        temporary.rename(target)
    finally:
        temporary.unlink(missing_ok=True)


def java_version(home):
    if not (home / "bin/java").is_file() or not (home / "bin/javac").is_file():
        return None
    try:
        result = subprocess.run([str(home / "bin/java"), "-version"], capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError):
        return None
    match = re.search(r'(?:openjdk|java) version "([^\"]+)"', result.stdout + result.stderr)
    return match.group(1) if match else None


def validate_signing_chain(cache):
    key = cache / "microsoft.asc"
    release = cache / "ms-InRelease"
    download(KEY_URL, key)
    download(REPOSITORY + "dists/bookworm/InRelease", release)
    # Isolate GPG from the real user's keys/configuration and keep imported keys temporary.
    with tempfile.TemporaryDirectory(prefix="java-key-verification-", dir=cache) as temporary_name:
        keyring_home = Path(temporary_name)
        keyring_home.chmod(0o700)
        gpg = ["gpg", "--batch", "--no-auto-key-retrieve", "--homedir", str(keyring_home)]
        inspected = subprocess.run(gpg + ["--with-colons", "--show-keys", str(key)], capture_output=True, text=True, check=True)
        fingerprints = [line.split(":")[9] for line in inspected.stdout.splitlines() if line.startswith("fpr:")]
        if fingerprints != [FINGERPRINT]:
            raise RuntimeError("Microsoft signing-key fingerprint differs from the trusted pin.")
        subprocess.run(gpg + ["--import", str(key)], capture_output=True, text=True, check=True)
        verified = subprocess.run(gpg + ["--status-fd", "2", "--decrypt", str(release)], capture_output=True, text=True, check=True)
        if not any(line.startswith(f"[GNUPG:] VALIDSIG {FINGERPRINT} ") for line in verified.stderr.splitlines()):
            raise RuntimeError("The package repository release did not have the pinned valid signature.")
        release_text = verified.stdout
    checksum_section = release_text.split("SHA256:\n", 1)[1].split("SHA512:", 1)[0]
    index_records = [line.split() for line in checksum_section.splitlines()]
    record = next((row for row in index_records if len(row) == 3 and row[2] == INDEX_PATH), None)
    if not record:
        raise RuntimeError("Signed release does not describe the required AMD64 package index.")
    index = cache / "ms-packages-amd64.gz"
    # Reuse the already authenticated index from an earlier setup session, when available.
    earlier_index = Path("/tmp/noeting-ms-packages.gz")
    if not index.exists() and earlier_index.is_file() and sha256(earlier_index) == record[0]:
        shutil.copyfile(earlier_index, index)
    download(REPOSITORY + "dists/bookworm/" + INDEX_PATH, index)
    if index.stat().st_size != int(record[1]) or sha256(index) != record[0]:
        raise RuntimeError("Package index checksum differs from the signed repository release.")
    package_text = gzip.decompress(index.read_bytes()).decode()
    package = None
    for stanza in package_text.split("\n\n"):
        fields = {}
        for line in stanza.splitlines():
            if ": " in line and not line.startswith(" "):
                name, value = line.split(": ", 1)
                fields[name] = value
        if fields.get("Package") == "msopenjdk-17" and fields.get("Version") == VERSION and fields.get("Architecture") == "amd64":
            package = fields
            break
    if not package or package.get("Filename") != PACKAGE_PATH or package.get("SHA256") != PACKAGE_SHA256 or int(package.get("Size", 0)) != PACKAGE_SIZE:
        raise RuntimeError("Signed package index does not match the pinned Java 17 artifact.")
    log("Verified Microsoft key, repository signature, and pinned package-index entry.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--java-home", type=Path, help="Reuse this already installed JDK; it must include Java and javac 17.")
    parser.add_argument("--jdk-root", type=Path, default=Path("/workspace/.jdks"))
    parser.add_argument("--cache", type=Path, default=Path("/workspace/.cache/android"))
    parser.add_argument("--print-home", action="store_true")
    args = parser.parse_args()
    if args.java_home:
        home = args.java_home.resolve()
        version = java_version(home)
        if not version or not version.startswith("17."):
            parser.error("--java-home must point to a working Java 17 JDK, including javac.")
        log(f"Reusing installed Java {version}.")
    else:
        if platform.system() != "Linux" or platform.machine() not in ("x86_64", "amd64"):
            parser.error("The pinned Java artifact targets Linux x86_64. Supply --java-home for another host.")
        for command in ("curl", "gpg", "dpkg-deb"):
            if not shutil.which(command):
                parser.error(f"Required setup command is missing: {command}")
        cache = args.cache.resolve()
        cache.mkdir(parents=True, exist_ok=True)
        validate_signing_chain(cache)
        archive = cache / "msopenjdk-17.0.20.1.deb"
        download(REPOSITORY + PACKAGE_PATH, archive)
        if archive.stat().st_size != PACKAGE_SIZE or sha256(archive) != PACKAGE_SHA256:
            raise RuntimeError("Java archive size or SHA256 differs from the signed, pinned artifact.")
        log("Verified Java 17 package SHA256.")
        root = args.jdk_root.resolve()
        root.mkdir(parents=True, exist_ok=True)
        target = root / JDK_DIRECTORY
        home = target / JDK_RELATIVE_HOME
        if target.exists():
            if java_version(home) != "17.0.20.1":
                raise RuntimeError(f"Refusing to overwrite an unexpected existing JDK: {target}")
        else:
            with tempfile.TemporaryDirectory(prefix="java17-unpack-", dir=root) as temporary_name:
                temporary = Path(temporary_name)
                subprocess.run(["dpkg-deb", "--extract", str(archive), str(temporary)], check=True)
                if java_version(temporary / JDK_RELATIVE_HOME) != "17.0.20.1":
                    raise RuntimeError("Extracted JDK did not report the pinned Java version.")
                temporary.rename(target)
        log(f"Java 17 ready at {home}")
    print(str(home) if args.print_home else f"JAVA_HOME={home}")


if __name__ == "__main__":
    main()
