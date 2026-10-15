"""Guard APK manifest checks against aapt output differences and false passes."""

import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location(
    "apk_verifier", Path(__file__).resolve().parents[1] / "scripts/verify-android-apk.py"
)
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class ManifestChecks(unittest.TestCase):
    def test_aapt2_namespace_and_nested_attributes(self):
        tree = """  E: manifest (line=2)
      E: application (line=33)
        A: http://schemas.android.com/apk/res/android:allowBackup(0x01010280)=false
          E: activity (line=57)
            A: http://schemas.android.com/apk/res/android:allowBackup(0x01010280)=true
"""
        attributes = verifier.application_attributes(tree)
        self.assertIs(verifier.boolean_attribute(attributes, "android:allowBackup"), False)

    def test_component_cannot_supply_missing_application_backup_flag(self):
        tree = """  E: manifest
    E: application
      E: activity
        A: android:allowBackup(0x01010280)=false
"""
        attributes = verifier.application_attributes(tree)
        self.assertIsNone(verifier.boolean_attribute(attributes, "android:allowBackup"))

    def test_legacy_typed_boolean_and_explicit_true(self):
        for value, expected in [("(type 0x12)0x0", False), ("(type 0x12)0xffffffff", True), ("true", True)]:
            with self.subTest(value=value):
                tree = f"  E: application\n    A: android:allowBackup(0x01010280)={value}\n"
                attributes = verifier.application_attributes(tree)
                self.assertIs(verifier.boolean_attribute(attributes, "android:allowBackup"), expected)

    def test_duplicate_aliases_and_multiple_applications_are_rejected(self):
        for tree in [
            "  E: application\n    A: android:allowBackup=false\n    A: http://schemas.android.com/apk/res/android:allowBackup=true\n",
            "  E: application\n  E: application\n",
            "  E: manifest\n",
        ]:
            with self.subTest(tree=tree), self.assertRaises(verifier.VerificationError):
                verifier.application_attributes(tree)

    def test_unresolved_backup_resource_is_rejected(self):
        with self.assertRaises(verifier.VerificationError):
            verifier.boolean_attribute({"android:allowBackup": "@0x7f010000"}, "android:allowBackup")


if __name__ == "__main__":
    unittest.main()
