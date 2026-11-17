package com.nautica

import com.google.zxing.*
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import com.google.zxing.qrcode.QRCodeWriter
import com.nautica.data.Fleet
import com.nautica.model.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class BoardingQrTest {
    @Test fun boardingMetadataSurvivesQrScanAndJsonDecode() {
        val booking = Booking("NTC-A1B2C3D4", Fleet.boats.last(), "2027-01-15", Fleet.slots[2], 4,
            "आरव शर्मा · Élodie", AddOn.entries.toSet(), total(Fleet.boats.last(), AddOn.entries.toSet()), "VISA · 4242")
        val encoded = Json.encodeToString(booking)
        val matrix = QRCodeWriter().encode(encoded, BarcodeFormat.QR_CODE, 512, 512, mapOf(EncodeHintType.CHARACTER_SET to "UTF-8"))
        val pixels = IntArray(512 * 512) { index -> if (matrix[index % 512, index / 512]) 0xFF000000.toInt() else 0xFFFFFFFF.toInt() }
        val scanned = QRCodeReader().decode(BinaryBitmap(HybridBinarizer(RGBLuminanceSource(512, 512, pixels)))).text
        assertEquals(booking, Json.decodeFromString<Booking>(scanned))
    }
}
