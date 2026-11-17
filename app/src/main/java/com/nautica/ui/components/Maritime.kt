package com.nautica.ui.components
import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.nautica.ui.theme.*
fun qrBitmap(value: String): Bitmap {
 val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 512, 512, mapOf(EncodeHintType.CHARACTER_SET to "UTF-8"))
 return Bitmap.createBitmap(512, 512, Bitmap.Config.ARGB_8888).apply { for (x in 0..511) for (y in 0..511) setPixel(x, y, if (matrix[x,y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE) }
}
@Composable fun Qr(value: String, modifier: Modifier = Modifier) { val bitmap = remember(value) { qrBitmap(value).asImageBitmap() }; Image(bitmap, "Scannable boarding pass QR", modifier.size(190.dp)) }
@Composable fun VesselArt(type: String, modifier: Modifier = Modifier) {
 Canvas(modifier.fillMaxWidth().height(155.dp).background(Brush.verticalGradient(listOf(Color(0xFFD8ECEB), Color(0xFFA7D1D3))))) {
  val w = size.width; val h = size.height
  drawCircle(Gold.copy(alpha=.6f), 23.dp.toPx(), Offset(w*.82f,h*.24f))
  for (i in 0..5) drawLine(Color.White.copy(alpha=.35f), Offset(w*(i%2)*.08f, h*(.67f+i*.055f)), Offset(w,h*(.67f+i*.055f)), 2.dp.toPx())
  val hull = Path().apply { moveTo(w*.16f,h*.58f); lineTo(w*.86f,h*.58f); lineTo(w*.74f,h*.8f); lineTo(w*.3f,h*.8f); close() }
  drawPath(hull,Navy)
  if (type.contains("Wooden")) { drawLine(Navy, Offset(w*.49f,h*.15f),Offset(w*.49f,h*.59f),4.dp.toPx()); drawPath(Path().apply { moveTo(w*.51f,h*.16f); lineTo(w*.72f,h*.53f); lineTo(w*.51f,h*.53f); close() },Color.White) }
  else { drawRoundRect(Color.White,Offset(w*.35f,h*.34f), androidx.compose.ui.geometry.Size(w*.33f,h*.24f), androidx.compose.ui.geometry.CornerRadius(12f)); drawLine(Teal,Offset(w*.4f,h*.43f),Offset(w*.61f,h*.43f),9.dp.toPx()) }
 }
}
@Composable fun SectionTitle(text: String) { Text(text, style=MaterialTheme.typography.titleLarge, color=Navy, modifier=Modifier.padding(top=12.dp,bottom=8.dp)) }
@Composable fun PriceRow(label: String, price: String) { Row(Modifier.fillMaxWidth().padding(vertical=5.dp),horizontalArrangement=Arrangement.SpaceBetween) { Text(label); Text(price,style=MaterialTheme.typography.titleMedium) } }
