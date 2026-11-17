package com.nautica.ui.screens
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.nautica.model.*
import com.nautica.data.PassExporter
import com.nautica.ui.components.*
import com.nautica.ui.theme.*
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
@Composable fun PassScreen(booking:Booking?,currency:Currency,home:()->Unit) {
 val scope=rememberCoroutineScope();val context=LocalContext.current;var error by remember { mutableStateOf<String?>(null) };var show by remember { mutableStateOf(false) };LaunchedEffect(Unit){show=true}
 val saver=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/pdf")) { uri -> if(uri!=null && booking!=null) scope.launch { runCatching { PassExporter.save(context,uri,booking,currency) }.onFailure {error="Could not export the pass. Please try again."} } }
 if(booking==null) { Box(Modifier.fillMaxSize(),contentAlignment=androidx.compose.ui.Alignment.Center){Text("Loading your pass…")};return }
 Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
  AnimatedVisibility(show) { Column { Text("✓",style=MaterialTheme.typography.displayMedium,color=Teal); SectionTitle("Booking confirmed!");Text("Your next horizon is waiting.") } }
  Card(shape=androidx.compose.foundation.shape.RoundedCornerShape(24.dp)) { Column(Modifier.padding(24.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
   Text("NAUTICA  /  BOARDING PASS",color=Teal,style=MaterialTheme.typography.labelLarge);Text(booking.id,style=MaterialTheme.typography.headlineSmall)
   Text("${booking.name}\n${booking.boat.name}",style=MaterialTheme.typography.titleLarge)
   Text("${booking.boat.pier}\n${booking.date} · ${booking.slot}\n${booking.guests} guests · 1 hour")
   Canvas(Modifier.fillMaxWidth().height(24.dp)) { drawLine(Navy.copy(alpha=.3f),Offset(0f,size.height/2),Offset(size.width,size.height/2),pathEffect=PathEffect.dashPathEffect(floatArrayOf(10f,8f)));drawCircle(Seafoam,14.dp.toPx(),Offset(-24.dp.toPx(),size.height/2));drawCircle(Seafoam,14.dp.toPx(),Offset(size.width+24.dp.toPx(),size.height/2)) }
   Text(booking.extras.joinToString("\n"){it.title});PriceRow("Total paid",currency.format(booking.total));SuggestionChip({},label={Text(booking.method)})
   Box(Modifier.fillMaxWidth(),contentAlignment=androidx.compose.ui.Alignment.Center) { Qr(Json.encodeToString(booking)) }
   Text("Arrive 15 minutes early. Show this pass at the pier.\nDemo pass · Not valid for real travel.",style=MaterialTheme.typography.bodySmall)
  } }
  Button({saver.launch("${booking.id}.pdf")},Modifier.fillMaxWidth()) { Text("Save pass as PDF") }
  OutlinedButton({scope.launch {runCatching {PassExporter.share(context,booking,currency)}.onFailure {error="No sharing app is available."}}},Modifier.fillMaxWidth()) {Text("Share boarding pass")}
  error?.let {Text(it,color=MaterialTheme.colorScheme.error)}
  TextButton(home,Modifier.fillMaxWidth()){Text("Explore more voyages")}
 }
}
@Composable fun MyPassScreen(bookings:List<Booking>,currency:Currency,open:(String)->Unit) {
 LazyColumn(contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
  item {SectionTitle("My boarding passes");Text("Saved on this device · Available offline")}
  if(bookings.isEmpty()) item {Text("Your voyages will appear here after booking.",Modifier.padding(vertical=32.dp))}
  items(bookings,key={it.id}) { b -> Card(onClick={open(b.id)}) {Column(Modifier.fillMaxWidth().padding(20.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){Text(b.boat.name,style=MaterialTheme.typography.titleLarge);Text("${b.date} · ${b.slot}");Text("${b.id} · ${b.guests} guests");Text(currency.format(b.total),color=Teal)}} }
 }
}
