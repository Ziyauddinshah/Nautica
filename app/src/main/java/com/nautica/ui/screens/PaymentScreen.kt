package com.nautica.ui.screens
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import com.nautica.model.*
import com.nautica.viewmodel.TripState
import com.nautica.ui.components.*
import com.nautica.ui.theme.*
@Composable fun PaymentScreen(state: TripState,currency: Currency,pay:(String,String)->Unit) {
 var tab by rememberSaveable { mutableIntStateOf(0) }; var name by rememberSaveable { mutableStateOf("") }; var upi by remember { mutableStateOf("") }; var app by rememberSaveable { mutableStateOf("GPay") }; var number by remember { mutableStateOf("") }; var holder by remember { mutableStateOf("") }; var expiry by remember { mutableStateOf("") }; var cvv by remember { mutableStateOf("") }; var bank by rememberSaveable { mutableStateOf("") }; var query by rememberSaveable { mutableStateOf("") }; var attempted by remember { mutableStateOf(false) }
 val valid = name.trim().length>=2 && when(tab) { 0 -> Validation.upi(upi); 1 -> Validation.card(number) && holder.trim().length>=2 && Validation.expiry(expiry) && Validation.cvv(number,cvv); else -> bank.isNotEmpty() }
 Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(14.dp)) {
  SectionTitle("Secure checkout"); Text("Demo payment · No money will be charged",color=Teal)
  TripSummary(state)
  OutlinedTextField(name,{name=it.take(80)},label={Text("Lead guest name")},singleLine=true,isError=attempted && name.trim().length<2,modifier=Modifier.fillMaxWidth())
  TabRow(tab) { listOf("UPI / QR","Card","Net banking").forEachIndexed { i,label -> Tab(tab==i,{tab=i},text={Text(label)}) } }
  when(tab) {
   0 -> {
    Text("Scan to preview this demo payment request",style=MaterialTheme.typography.bodySmall)
    Box(Modifier.fillMaxWidth(),contentAlignment=androidx.compose.ui.Alignment.Center) { Qr("NAUTICA-DEMO:PAYMENT:${state.boat?.id}:${state.boat?.let { total(it,state.extras) }}") }
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) { listOf("GPay","PhonePe","Paytm","BHIM").forEach { label -> FilterChip(app==label,{app=label},{Text(label)}) } }
    OutlinedTextField(upi,{upi=it.trim()},label={Text("UPI ID · username@bank")},isError=attempted && !Validation.upi(upi),supportingText={Text("Enter a valid UPI ID to simulate payment with $app.")},singleLine=true,modifier=Modifier.fillMaxWidth())
   }
   1 -> {
    Column(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Navy,Teal)),RoundedCornerShape(24.dp)).padding(24.dp),verticalArrangement=Arrangement.spacedBy(24.dp)) {
     Text("NAUTICA                         ${Validation.network(number)}",color=Color.White)
     Text(number.chunked(4).joinToString(" ").ifBlank { "••••  ••••  ••••  ••••" },color=Color.White,style=MaterialTheme.typography.titleLarge)
     Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) { Text(holder.uppercase().ifBlank { "CARDHOLDER NAME" },color=Color.White); Text(expiry.ifBlank { "MM/YY" },color=Color.White) }
    }
    OutlinedTextField(number,{number=it.filter(Char::isDigit).take(19)},label={Text("Card number")},isError=attempted && !Validation.card(number),keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),visualTransformation=CardGroups,singleLine=true,modifier=Modifier.fillMaxWidth())
    OutlinedTextField(holder,{holder=it.take(80)},label={Text("Cardholder name")},isError=attempted && holder.trim().length<2,singleLine=true,modifier=Modifier.fillMaxWidth())
    Row(horizontalArrangement=Arrangement.spacedBy(12.dp)) {
     OutlinedTextField(expiry,{ val digits=it.filter(Char::isDigit).take(4); expiry=if(digits.length>2) digits.take(2)+"/"+digits.drop(2) else digits },label={Text("MM/YY")},isError=attempted && !Validation.expiry(expiry),keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),modifier=Modifier.weight(1f),singleLine=true)
     OutlinedTextField(cvv,{cvv=it.filter(Char::isDigit).take(4)},label={Text("CVV")},isError=attempted && !Validation.cvv(number,cvv),visualTransformation=PasswordVisualTransformation(),keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.NumberPassword),modifier=Modifier.weight(1f),singleLine=true)
    }
   }
   2 -> {
    val banks=listOf("SBI","HDFC Bank","ICICI Bank","Axis Bank","Bank of Baroda","Canara Bank","Kotak Mahindra","Punjab National Bank","Union Bank")
    banks.take(4).chunked(2).forEach { row -> Row(horizontalArrangement=Arrangement.spacedBy(12.dp)) { row.forEach { label -> FilterChip(bank==label,{bank=label},{Text(label)},modifier=Modifier.weight(1f)) } } }
    OutlinedTextField(query,{query=it},label={Text("Search other banks")},modifier=Modifier.fillMaxWidth(),singleLine=true)
    if(query.isNotBlank()) { val found=banks.filter { it.contains(query,true) }; if(found.isEmpty()) Text("No matching banks"); found.forEach { label -> FilterChip(bank==label,{bank=label},{Text(label)}) } }
    Text(if(bank.isEmpty()) "Select your bank" else "Selected · $bank")
   }
  }
  Breakdown(state,currency)
  if(attempted && !valid) Text("Check the highlighted fields and select a payment method.",color=MaterialTheme.colorScheme.error)
  state.error?.let { Text(it,color=MaterialTheme.colorScheme.error) }
  Button({attempted=true; if(valid) pay(name,when(tab){0->"UPI · $app";1->Validation.network(number)+" · "+number.takeLast(4);else->"Net banking · $bank"})},Modifier.fillMaxWidth(),enabled=!state.processing) { Text(if(tab==0) "Verify & pay (demo)" else "Pay securely (demo)") }
  Text("Payment details stay in memory and are never saved to your boarding pass.",style=MaterialTheme.typography.bodySmall)
 }
 if(state.processing) AlertDialog(onDismissRequest={},confirmButton={},title={Text("Confirming your booking")},text={Row(horizontalArrangement=Arrangement.spacedBy(16.dp)){CircularProgressIndicator();Text("Simulating secure processing…")}})
}
private val CardGroups = VisualTransformation { value ->
 val text=value.text.chunked(4).joinToString(" ")
 TransformedText(androidx.compose.ui.text.AnnotatedString(text),object:OffsetMapping {
  override fun originalToTransformed(offset:Int) = (offset + (offset/4).coerceAtMost((value.length-1).coerceAtLeast(0)/4)).coerceAtMost(text.length)
  override fun transformedToOriginal(offset:Int) = (offset-offset/5).coerceAtMost(value.length)
 })
}
