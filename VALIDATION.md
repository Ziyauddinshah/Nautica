# Validation

Completed in the delivery workspace with Amazon Corretto JDK 17, Gradle 8.11.1, Android SDK Platform 35 and Build Tools 35.0.0.

Command: `./gradlew testDebugUnitTest assembleDebug lintDebug`

- Debug APK assembled successfully and signed with a development key.
- 5 JVM tests passed, zero failures/errors.
- Tests cover UPI validation, card Luhn checks, expiry, CVV/network detection, currency conversion, five-percent fee calculation, and QR encoding/scanning plus JSON decoding with Hindi and accented passenger names.
- Android lint completed: 0 errors, 10 warnings. Warnings concern available dependency updates, optional KTX bitmap helpers, and a backup-configuration recommendation; backup is disabled and both legacy and Android 12+ backup attributes are provided. Versions remain pinned to the compatible set used for this build.
- Gradle distribution SHA-256 verified; wrapper configuration pins that checksum.

No emulator or physical Android device was available. Visual layout, keyboard behavior, document picker, installed sharing apps, lifecycle behavior, and offline reopening have not been exercised on a device. See MANUAL_QA.md for the remaining acceptance checks.

The configured `/codex/browser/projectless/0007-boat-image/output` download directory could not be created in this execution environment (read-only filesystem/permission denied). Source and the generated APK remain in the shared workspace. No production deployment or real payment was performed.
