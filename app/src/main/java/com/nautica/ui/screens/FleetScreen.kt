package com.nautica.ui.screens
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nautica.data.Fleet
import com.nautica.model.*
import com.nautica.viewmodel.*
import com.nautica.ui.components.*
import com.nautica.ui.theme.*
import java.time.*
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun FleetScreen(state: TripState, currency: Currency, update: ((TripState)->TripState)->Unit, book: (Boat)->Unit) {
 var picker by remember { mutableStateOf(false) }
 var filters by remember { mutableStateOf(false) }
 val filtered = Fleet.boats.filter { it.pier == state.pier && (state.type == "All" || it.type == state.type) && it.capacity >= state.guests }
 LazyColumn(contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(14.dp)) {
  item { Text("THE WATER IS CALLING",color=Teal,style=MaterialTheme.typography.labelLarge); Text("Find your next\nhorizon.",style=MaterialTheme.typography.displaySmall,fontWeight=FontWeight.Bold); Text("Private charters. Unforgettable moments.",Modifier.padding(top=8.dp)) }
  item { Card { Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
   SectionTitle("Plan your escape")
   OutlinedButton({filters=true},Modifier.fillMaxWidth()) { Text("Search & filter voyage") }
   Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)) { Fleet.piers.forEach { pier -> FilterChip(state.pier==pier,{update { it.copy(pier=pier) }},{Text(pier)}) } }
   OutlinedButton({picker=true},Modifier.fillMaxWidth()) { Text("Boarding date · ${state.date}") }
   Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)) { Fleet.slots.forEach { slot -> FilterChip(state.slot==slot,{update { it.copy(slot=slot) }},{Text(slot)}) } }
   Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) { Text("Guests",Modifier.padding(top=12.dp)); Row { OutlinedButton({update { it.copy(guests=(it.guests-1).coerceAtLeast(1)) }},enabled=state.guests>1) { Text("−") }; Text("${state.guests}",Modifier.padding(14.dp)); OutlinedButton({update { it.copy(guests=(it.guests+1).coerceAtMost(30)) }},enabled=state.guests<30) { Text("+") } } }
  } } }
  item { SectionTitle("Curated fleet · ${filtered.size}"); Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)) { Fleet.types.forEach { type -> FilterChip(state.type==type,{update { it.copy(type=type) }},{Text(type)}) } } }
  if (filtered.isEmpty()) item { Text("No vessels match this trip. Try another pier, vessel type, or guest count.",Modifier.padding(20.dp)) }
  items(filtered,key={it.id}) { boat -> Card(shape=androidx.compose.foundation.shape.RoundedCornerShape(24.dp)) { Column {
   VesselArt(boat.type)
   Column(Modifier.padding(18.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
    Surface(color=Teal.copy(alpha=.08f),shape=androidx.compose.foundation.shape.RoundedCornerShape(50.dp)) { Text("CAPTAIN INCLUDED",color=Teal,style=MaterialTheme.typography.labelSmall,modifier=Modifier.padding(horizontal=10.dp,vertical=6.dp)) }
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) { Text(boat.name,style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold); Text("★ ${boat.rating} (${boat.reviews})",color=Gold) }
    Text("${boat.pier} · Up to ${boat.capacity} guests",style=MaterialTheme.typography.bodyMedium)
    Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)) { boat.amenities.forEach { amenity -> Surface(color=Seafoam,shape=androidx.compose.foundation.shape.RoundedCornerShape(50.dp)) { Text(amenity,style=MaterialTheme.typography.labelSmall,modifier=Modifier.padding(horizontal=10.dp,vertical=6.dp)) } } }
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) { Column { Text(currency.format(boat.fare),style=MaterialTheme.typography.headlineSmall,fontWeight=FontWeight.Bold); Text("per private trip · 1 hour",style=MaterialTheme.typography.labelSmall) }; Button({book(boat)}) { Text("Book now") } }
   }
  } } }
  item { Text("Thoughtfully curated • Captain included • Safety first",style=MaterialTheme.typography.labelSmall,modifier=Modifier.padding(vertical=16.dp)) }
 }
 if (filters) ModalBottomSheet(onDismissRequest={filters=false}) {
  Column(Modifier.fillMaxWidth().padding(20.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
   SectionTitle("Find your perfect voyage")
   Text("Destination / boarding pier")
   Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)) { Fleet.piers.forEach { p -> FilterChip(state.pier==p,{update {it.copy(pier=p)}},{Text(p)}) } }
   OutlinedButton({picker=true},Modifier.fillMaxWidth()) {Text("Date · ${state.date}")}
   Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)) { Fleet.slots.forEach { slot -> FilterChip(state.slot==slot,{update {it.copy(slot=slot)}},{Text(slot)}) } }
   Text("Vessel type")
   Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)) { Fleet.types.forEach { type -> FilterChip(state.type==type,{update {it.copy(type=type)}},{Text(type)}) } }
   Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) { OutlinedButton({update {it.copy(guests=(it.guests-1).coerceAtLeast(1))}},enabled=state.guests>1) {Text("−")};Text("${state.guests} guests",Modifier.padding(12.dp));OutlinedButton({update {it.copy(guests=(it.guests+1).coerceAtMost(30))}},enabled=state.guests<30){Text("+")} }
   Button({filters=false},Modifier.fillMaxWidth()){Text("Show ${filtered.size} vessels")}
  }
 }
 if (picker) {
  val dateState=rememberDatePickerState(initialSelectedDateMillis=LocalDate.parse(state.date).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),selectableDates=object: SelectableDates { override fun isSelectableDate(utcTimeMillis: Long) = Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate() >= LocalDate.now() })
  DatePickerDialog(onDismissRequest={picker=false},confirmButton={TextButton({dateState.selectedDateMillis?.let { millis -> update { it.copy(date=Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()) } };picker=false}){Text("Set date")}},dismissButton={TextButton({picker=false}){Text("Cancel")}}) { DatePicker(dateState) }
 }
}
