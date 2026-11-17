package com.nautica.data
import android.content.Context
import android.content.Intent
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.Uri
import androidx.core.content.FileProvider
import com.nautica.model.*
import com.nautica.ui.components.qrBitmap
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
object PassExporter {
 fun bytes(booking: Booking,currency: Currency): ByteArray {
  val document=PdfDocument(); val page=document.startPage(PdfDocument.PageInfo.Builder(595,842,1).create()); val canvas=page.canvas; val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply { color=android.graphics.Color.rgb(10,25,47);textSize=15f }
  canvas.drawColor(android.graphics.Color.WHITE)
  paint.textSize=32f;canvas.drawText("NAUTICA",42f,65f,paint);paint.textSize=15f
  val lines=listOf("DIGITAL BOARDING PASS",booking.id,"Lead guest: ${booking.name}","Vessel: ${booking.boat.name}","Boarding pier: ${booking.boat.pier}","Date: ${booking.date}","Time: ${booking.slot}","Guests: ${booking.guests}","Paid: ${currency.format(booking.total)}",booking.method,"Add-ons:")+booking.extras.map { it.title }
  lines.forEachIndexed { i,line -> canvas.drawText(line.take(65),42f,110f+i*26f,paint) }
  val qr=qrBitmap(Json.encodeToString(booking));canvas.drawBitmap(qr,null,android.graphics.Rect(190,520,405,735),paint)
  paint.textSize=11f;canvas.drawText("Demo booking • Arrive 15 minutes before departure",42f,790f,paint)
  document.finishPage(page)
  return java.io.ByteArrayOutputStream().use { document.writeTo(it);document.close();it.toByteArray() }
 }
 suspend fun share(context:Context,booking:Booking,currency:Currency) {
  val uri=withContext(Dispatchers.IO) {
  val dir=File(context.cacheDir,"passes").apply { mkdirs() };val file=File(dir,"${booking.id}.pdf");file.writeBytes(bytes(booking,currency))
  FileProvider.getUriForFile(context,"${context.packageName}.files",file)
  }
  context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type="application/pdf";putExtra(Intent.EXTRA_STREAM,uri);addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) },"Share boarding pass"))
 }
 suspend fun save(context:Context,uri:Uri,booking:Booking,currency:Currency) = withContext(Dispatchers.IO) { context.contentResolver.openOutputStream(uri)?.use { it.write(bytes(booking,currency)) } ?: error("Cannot open destination") }
}
