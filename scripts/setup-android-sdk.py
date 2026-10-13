#!/usr/bin/env python3
"""Install the pinned Linux Android toolchain without an account or remote build service.

Requires Python 3 and curl. Google SDK license terms apply to these development
tools; the official installer records its standard noninteractive acceptance.
The initial SHA-1 values and sizes below are Google's repository2-3.xml values
verified on 2026-10-13. SHA-256 additionally pins the same verified archives.
No TLS or archive verification is disabled. Tool/cache files stay outside the
repository. Existing matching installations and verified downloads are reused.
"""

import argparse
import hashlib
import os
from pathlib import Path, PurePosixPath
import platform
import shutil
import stat
import subprocess
import tempfile
import zipfile


BASE_URL = "https://dl.google.com/android/repository/"
PACKAGES = [
    {
        "id": "cmdline-tools;23.0", "revision": "23.0", "prefix": "cmdline-tools",
        "archive": "commandlinetools-linux-16111833_latest.zip", "size": 181052239,
        "sha1": "e025545c62a8e64c7559119566a569fb1dec5f60",
        "sha256": "0877a1d048fe4a24efe2eff536ca4223f7adeb58648bb81909d33c446918cfa8",
    },
    {
        "id": "platform-tools", "revision": "37.0.1", "prefix": "platform-tools",
        "archive": "platform-tools_r37.0.1-linux.zip", "size": 9054187,
        "sha1": "477254aa5f903c15cf51001717bdf347fb6b53e0",
        "sha256": "d230f13842f60f782a8645f9c813f8f845bf36089ea7289f28c48f17979313f1",
    },
    {
        "id": "platforms;android-36", "revision": "2", "prefix": "android-36",
        "archive": "platform-36_r02.zip", "size": 65878410,
        "sha1": "2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576",
        "sha256": "37607369a28c5b640b3a7998868d45898ebcb777565a0e85f9acf36f29631d2e",
    },
    {
        "id": "build-tools;36.0.0", "revision": "36.0.0", "prefix": "android-16",
        "archive": "build-tools_r36_linux.zip", "size": 63737259,
        "sha1": "b0b6376977657e8ad9b969bacf4093601da2c6fb",
        "sha256": "5d9ac77fb6ff43d9da518a337b4fcf8f9097113df531d99ccefe80ef7ce8250b",
    },
    {
        # AGP 8.12 also requests this version while configuring native dependencies.
        "id": "build-tools;35.0.0", "revision": "35.0.0", "prefix": "android-15",
        "archive": "build-tools_r35_linux.zip", "size": 61958799,
        "sha1": "2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc",
        "sha256": "bd3a4966912eb8b30ed0d00b0cda6b6543b949d5ffe00bea54c04c81e1561d88",
    },
    {
        "id": "ndk;27.1.12297006", "revision": "27.1.12297006", "prefix": "android-ndk-r27b",
        "archive": "android-ndk-r27b-linux.zip", "size": 663976775,
        "sha1": "6fc476b2e57d7c01ac0c95817746b927035b9749",
        "sha256": "33e16af1a6bbabe12cad54b2117085c07eab7e4fa67cdd831805f0e94fd826c1",
    },
    {
        "id": "cmake;3.22.1", "revision": "3.22.1", "prefix": "",
        "archive": "cmake-3.22.1-linux.zip", "size": 22308647,
        "sha1": "fd0a48b4a758310df8c7aa51f59840ed48fe7ed8",
        "sha256": "9196644852a978012caf7a4067ba1898debf6cc204c3341562771e31080d6869",
    },
    {
        "id": "cmake;3.30.5", "revision": "3.30.5", "prefix": "",
        "archive": "cmake-3.30.5-linux.zip", "size": 29566687,
        "sha1": "c999a37fa18cb3e24dc003386cffe1d86add91b5",
        "sha256": "f225225f5c83afa456c00b4a4c50369ec618db45f09bef53906c5ff321063356",
    },
]


def hash_file(path, algorithm):
    digest = hashlib.new(algorithm)
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_archive(path, package):
    if path.stat().st_size != package["size"]:
        raise RuntimeError(f"Unexpected archive size: {path}")
    for algorithm in ("sha1", "sha256"):
        if hash_file(path, algorithm) != package[algorithm]:
            raise RuntimeError(f"Archive {algorithm} mismatch; do not use this download: {path}")


def download(package, cache):
    target = cache / package["archive"]
    if not target.exists():
        descriptor, temporary_name = tempfile.mkstemp(prefix=target.name + ".", suffix=".part", dir=cache)
        os.close(descriptor)
        temporary = Path(temporary_name)
        try:
            subprocess.run([
                "curl", "--fail", "--silent", "--show-error", "--location",
                "--proto", "=https", "--tlsv1.2", "--output", str(temporary),
                BASE_URL + package["archive"],
            ], check=True)
            verify_archive(temporary, package)
            temporary.rename(target)
        finally:
            temporary.unlink(missing_ok=True)
    verify_archive(target, package)
    return target


def package_directory(sdk, package):
    return sdk.joinpath(*package["id"].split(";"))


def has_expected_revision(directory, package):
    properties = directory / "source.properties"
    if not properties.is_file():
        return False
    values = {}
    for line in properties.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values.get("Pkg.Revision") == package["revision"]


def verify_installed(archive, directory, package):
    """Check the installed payload, including NDK symlinks, against the trusted archive."""
    with zipfile.ZipFile(archive) as source:
        for info in source.infolist():
            if info.is_dir():
                continue
            member = PurePosixPath(info.filename)
            if member.is_absolute() or ".." in member.parts:
                raise RuntimeError("Unsafe archive member")
            relative = member.relative_to(package["prefix"]) if package["prefix"] else member
            installed = directory / relative
            mode = info.external_attr >> 16
            expected = source.read(info)
            if stat.S_ISLNK(mode):
                if not installed.is_symlink() or os.readlink(installed) != expected.decode():
                    raise RuntimeError(f"Installed symlink differs from verified archive: {installed}")
            elif not installed.is_file() or hashlib.sha256(expected).hexdigest() != hash_file(installed, "sha256"):
                raise RuntimeError(f"Installed file differs from verified archive: {installed}")


def install_command_tools(archive, sdk, package):
    target = package_directory(sdk, package)
    if target.exists():
        if not has_expected_revision(target, package):
            raise RuntimeError(f"Refusing to overwrite unexpected existing tools: {target}")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="android-tools-", dir=target.parent) as temporary_name:
        temporary = Path(temporary_name)
        with zipfile.ZipFile(archive) as source:
            for info in source.infolist():
                member = PurePosixPath(info.filename)
                if member.is_absolute() or ".." in member.parts or member.parts[0] != package["prefix"]:
                    raise RuntimeError("Unsafe command-tools archive member")
                if stat.S_ISLNK(info.external_attr >> 16):
                    raise RuntimeError("Unexpected command-tools archive symlink")
            source.extractall(temporary)
            for info in source.infolist():
                extracted = temporary / info.filename
                if extracted.is_file():
                    extracted.chmod((info.external_attr >> 16) & 0o777 or 0o644)
        shutil.move(str(temporary / package["prefix"]), str(target))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk-root", type=Path, default=Path("/workspace/.android-sdk"))
    parser.add_argument("--cache", type=Path, default=Path("/workspace/.cache/android"))
    args = parser.parse_args()
    if platform.system() != "Linux" or platform.machine() not in ("x86_64", "amd64"):
        parser.error("These pinned artifacts target Linux x86_64; use the matching official SDK on other hosts.")
    sdk, cache = args.sdk_root.resolve(), args.cache.resolve()
    sdk.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    environment = os.environ.copy()
    environment["ANDROID_HOME"] = str(sdk)
    environment["ANDROID_USER_HOME"] = str(cache / "user")
    archives = {package["id"]: download(package, cache) for package in PACKAGES}
    command_tools = PACKAGES[0]
    install_command_tools(archives[command_tools["id"]], sdk, command_tools)
    executable = package_directory(sdk, command_tools) / "bin/android"
    base = [str(executable), "--no-metrics", f"--sdk={sdk}", "sdk", "install"]
    for package in PACKAGES:
        directory = package_directory(sdk, package)
        if package is not command_tools and not has_expected_revision(directory, package):
            if directory.exists():
                raise RuntimeError(f"Refusing to overwrite unexpected existing SDK package: {directory}")
            install_id = package["id"].replace(";", "/") + "@" + package["revision"]
            subprocess.run(base + [install_id], env=environment, check=True)
        if not has_expected_revision(directory, package):
            raise RuntimeError(f"Installer did not produce the required revision: {directory}")
        verify_installed(archives[package["id"]], directory, package)
        print(f"Verified {package['id']} revision {package['revision']}", flush=True)
    if not (sdk / "licenses/android-sdk-license").is_file():
        # The official installer owns license recording; never fabricate license hashes.
        subprocess.run(base + ["platform-tools@37.0.1"], env=environment, check=True)
    if not (sdk / "licenses/android-sdk-license").is_file():
        raise RuntimeError("Standard Android SDK license acceptance was not recorded by the installer.")
    print(f"Android SDK ready at {sdk}")


if __name__ == "__main__":
    main()
