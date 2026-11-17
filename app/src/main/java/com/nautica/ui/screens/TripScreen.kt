package com.nautica.ui.screens
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nautica.model.*
import com.nautica.viewmodel.TripState
import com.nautica.ui.components.*
@Composable fun TripSummary(state: TripState) { val boat=state.boat ?: return; SectionTitle(boat.name); Text("${boat.pier}\n${state.date} · ${state.slot}\n${state.guests} guests · 1 hour") }
@Composable fun Breakdown(state: TripState,currency: Currency) { val boat=state.boat ?: return; Card { Column(Modifier.padding(18.dp)) { SectionTitle("Your fare"); PriceRow("Private vessel",currency.format(boat.fare)); state.extras.forEach { PriceRow(it.title,if(it.price==0L) "Included" else currency.format(it.price)) }; PriceRow("Port & pier fee · 5%",currency.format(total(boat,state.extras)-subtotal(boat,state.extras))); HorizontalDivider(); PriceRow("Grand total",currency.format(total(boat,state.extras))) } } }
@Composable fun TripScreen(state: TripState,currency: Currency,toggle: (AddOn)->Unit,next:()->Unit) {
 Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
  TripSummary(state); SectionTitle("Make it yours")
  AddOn.entries.forEach { add -> Card { Row(Modifier.fillMaxWidth().padding(12.dp)) { Checkbox(add in state.extras,{toggle(add)},enabled=add!=AddOn.SAFETY); Column(Modifier.padding(8.dp)) { Text(add.title); Text(if(add.price==0L) "Free · included" else "+ ${currency.format(add.price)}") } } } }
  Breakdown(state,currency); Button(next,Modifier.fillMaxWidth()) { Text("Proceed to payment · ${state.boat?.let { currency.format(total(it,state.extras)) }}") }
 }
}
