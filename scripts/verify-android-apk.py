#!/usr/bin/env python3
"""Validate the standalone M1 APK without claiming Android runtime validation."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile


class VerificationError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise VerificationError(message)


def run_tool(executable, arguments, label, result):
    require(executable.is_file(), f"Missing Android build tool: {executable}")
    process = subprocess.run(
        [str(executable), *arguments], capture_output=True, text=True, check=False
    )
    result["toolExitCodes"][label] = process.returncode
    require(
        process.returncode == 0,
        f"{label} failed with exit code {process.returncode}: "
        f"{(process.stderr.strip() or process.stdout.strip())[:3000]}",
    )
    return process.stdout


def badging_value(text, expression, description):
    match = re.search(expression, text, re.MULTILINE)
    require(match is not None, f"APK badging omitted {description}")
    return match.group(1)


def application_attributes(xmltree):
    """Read attributes on application itself, excluding component attributes."""
    stack = []
    attributes = {}
    application_count = 0
    for line in xmltree.splitlines():
        node = re.match(r"^(\s*)E:\s+([^\s(]+)", line)
        if node:
            indent, name = len(node.group(1)), node.group(2)
            while stack and stack[-1][0] >= indent:
                stack.pop()
            stack.append((indent, name))
            if name == "application":
                application_count += 1
            continue
        attribute = re.match(r"^\s*A:\s+([^\s=(]+)(?:\([^)]*\))?=(.*)$", line)
        if attribute and stack and stack[-1][1] == "application":
            name, value = attribute.group(1), attribute.group(2).strip()
            require(name not in attributes, f"Duplicate application attribute: {name}")
            attributes[name] = value
    require(application_count == 1, "APK manifest must have exactly one application")
    return attributes


def boolean_attribute(attributes, name, default=None):
    value = attributes.get(name)
    if value is None:
        return default
    typed = re.match(r"\(type 0x12\)\s*0x([0-9a-fA-F]+)(?:\s|$)", value)
    if typed:
        return int(typed.group(1), 16) != 0
    literal = re.match(r'"?(true|false)"?(?:\s|$)', value)
    if literal:
        return literal.group(1) == "true"
    raise VerificationError(f"Cannot resolve manifest boolean {name}: {value}")


def verify(args, result):
    apk = args.apk.resolve()
    require(apk.is_file(), f"APK does not exist: {apk}")
    result["apk"] = str(apk)
    result["bytes"] = apk.stat().st_size
    require(result["bytes"] > 0, "APK is empty")
    digest = hashlib.sha256()
    with apk.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    result["sha256"] = digest.hexdigest()

    expected_abis = set(args.abi or ["arm64-v8a"])
    required_libraries = {"libexpo-sqlite.so", "libhermes.so", "libreactnative.so"}
    with zipfile.ZipFile(apk) as archive:
        corrupt = archive.testzip()
        require(corrupt is None, f"APK ZIP integrity failed for {corrupt}")
        names = archive.namelist()
        require(len(names) == len(set(names)), "APK contains duplicate ZIP paths")
        require("AndroidManifest.xml" in names, "APK lacks AndroidManifest.xml")
        require("classes.dex" in names and archive.getinfo("classes.dex").file_size > 0, "APK lacks nonempty classes.dex")
        bundle_name = "assets/index.android.bundle"
        require(bundle_name in names, "APK lacks its standalone embedded Android bundle")
        bundle = archive.read(bundle_name)
        # React Native's JSBundleType.cpp defines this little-endian Hermes magic.
        require(len(bundle) > 12 and bundle[:8] == bytes.fromhex("c61fbc03c103191f"), "Embedded Android bundle is not nonempty Hermes bytecode")
        result["embeddedBundle"] = {"path": bundle_name, "bytes": len(bundle), "format": "Hermes bytecode"}
        actual_abis = set()
        libraries = {}
        for name in names:
            match = re.fullmatch(r"lib/([^/]+)/([^/]+\.so)", name)
            if match:
                abi, library = match.groups()
                actual_abis.add(abi)
                require(archive.getinfo(name).file_size > 0, f"Empty native library: {name}")
                libraries.setdefault(abi, set()).add(library)
        require(actual_abis == expected_abis, f"Expected ABIs {sorted(expected_abis)}, found {sorted(actual_abis)}")
        for abi in sorted(expected_abis):
            missing = required_libraries - libraries.get(abi, set())
            require(not missing, f"Missing {abi} native libraries: {sorted(missing)}")
        result["abis"] = sorted(actual_abis)
        result["requiredNativeLibraries"] = sorted(required_libraries)
        result["zipIntegrity"] = "passed"

    build_tools = args.build_tools.resolve()
    signature = run_tool(build_tools / "apksigner", ["verify", "--verbose", "--print-certs", str(apk)], "apksignerVerify", result)
    result["signatureVerified"] = True
    result["signerCertificateSha256"] = re.findall(r"^Signer #\d+ certificate SHA-256 digest: (\S+)", signature, re.MULTILINE)
    require(result["signerCertificateSha256"], "Signature verifier omitted signer certificate digest")
    run_tool(build_tools / "zipalign", ["-c", "-P", "16", "4", str(apk)], "zipalign16K", result)
    result["zipAlignment16K"] = "passed"

    aapt2 = build_tools / "aapt2"
    badging = run_tool(aapt2, ["dump", "badging", str(apk)], "aapt2Badging", result)
    package = badging_value(badging, r"^package: name='([^']+)'", "package name")
    minimum_sdk = int(badging_value(badging, r"^sdkVersion:'([^']+)'", "minimum SDK"))
    target_sdk = int(badging_value(badging, r"^targetSdkVersion:'([^']+)'", "target SDK"))
    launcher = badging_value(badging, r"^launchable-activity: name='([^']+)'", "launcher activity")
    require(package == "com.noeting.app", f"Unexpected package: {package}")
    require(minimum_sdk == 24, f"Expected minimum SDK 24, found {minimum_sdk}")
    require(target_sdk == 36, f"Expected target SDK 36, found {target_sdk}")
    require(launcher in {"com.noeting.app.MainActivity", ".MainActivity"}, f"Unexpected launcher: {launcher}")
    badged_abis = badging_value(badging, r"^native-code:\s*(.+)$", "native ABIs")
    require(set(re.findall(r"'([^']+)'", badged_abis)) == expected_abis, "Manifest badging and expected native ABIs disagree")

    xmltree = run_tool(aapt2, ["dump", "xmltree", "--file", "AndroidManifest.xml", str(apk)], "aapt2Manifest", result)
    attributes = application_attributes(xmltree)
    allow_backup = boolean_attribute(attributes, "android:allowBackup")
    require(allow_backup is False, "Merged manifest must explicitly set android:allowBackup=false")
    result["manifest"] = {"package": package, "minSdk": minimum_sdk, "targetSdk": target_sdk, "launcher": launcher, "allowBackup": allow_backup, "debuggable": boolean_attribute(attributes, "android:debuggable", False)}
    permissions = run_tool(aapt2, ["dump", "permissions", str(apk)], "aapt2Permissions", result)
    result["permissions"] = sorted(set(re.findall(r"^uses-permission(?:-sdk-\d+)?: name='([^']+)'", permissions, re.MULTILINE)))
    blocked = {"android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE", "android.permission.SYSTEM_ALERT_WINDOW", "android.permission.VIBRATE"}
    require(not blocked.intersection(result["permissions"]), "APK declares unused M1 permissions that should be blocked")
    result["status"] = "passed"


def main():
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", nargs="?", type=Path, default=root / "artifacts/noeting-m1-android-arm64-test.apk")
    parser.add_argument("--build-tools", type=Path, default=Path("/workspace/.android-sdk/build-tools/36.0.0"))
    parser.add_argument("--abi", action="append", help="Expected ABI (repeatable; default: arm64-v8a)")
    args = parser.parse_args()
    result = {"status": "failed", "scope": "Static APK validation; Android runtime and device tests are not executed.", "toolExitCodes": {}}
    try:
        verify(args, result)
    except (VerificationError, OSError, ValueError, zipfile.BadZipFile) as error:
        result["error"] = str(error)
        print(json.dumps(result, indent=2), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
