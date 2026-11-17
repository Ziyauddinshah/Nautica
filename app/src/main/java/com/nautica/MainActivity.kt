package com.nautica
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.BackHandler
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.*
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Anchor
import androidx.compose.material.icons.filled.ConfirmationNumber
import androidx.compose.foundation.layout.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.*
import com.nautica.model.Currency
import com.nautica.viewmodel.NauticaViewModel
import com.nautica.ui.theme.*
import com.nautica.ui.screens.*
import java.time.LocalDate
class MainActivity:ComponentActivity() {
 override fun onCreate(savedInstanceState:Bundle?) { super.onCreate(savedInstanceState);setContent {NauticaTheme {NauticaApp()}} }
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun NauticaApp(vm:NauticaViewModel=viewModel()) {
 val trip by vm.trip.collectAsStateWithLifecycle();val currency by vm.currency.collectAsStateWithLifecycle();val bookings by vm.bookings.collectAsStateWithLifecycle()
 val nav=rememberNavController();val entry by nav.currentBackStackEntryAsState();val route=entry?.destination?.route
 BackHandler(trip.processing) {}
 LaunchedEffect(trip.completed) {trip.completed?.let { nav.navigate("pass/$it") {popUpTo("fleet");launchSingleTop=true} } }
 Scaffold(topBar={TopAppBar(title={Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){Icon(Icons.Default.Anchor,contentDescription=null,tint=Teal);Text("Nautica",color=Navy)}},navigationIcon={if(route!="fleet" && !trip.processing) IconButton({nav.popBackStack()}){Icon(Icons.AutoMirrored.Filled.ArrowBack,"Back")}},actions={
  TextButton({vm.currency(if(currency==Currency.INR)Currency.USD else Currency.INR)},enabled=!trip.processing){Text(if(currency==Currency.INR)"₹ INR ⇄" else "$ USD ⇄")}
  IconButton({nav.navigate("passes"){launchSingleTop=true}},enabled=!trip.processing){BadgedBox(badge={val active=bookings.count {LocalDate.parse(it.date)>=LocalDate.now()};if(active>0)Badge{Text("$active")}}){Icon(Icons.Default.ConfirmationNumber,"My passes")}}
 })}) { padding -> Box(Modifier.padding(padding)) {
 NavHost(nav,startDestination="fleet") {
  composable("fleet") {FleetScreen(trip,currency,vm::update){boat->vm.select(boat);nav.navigate("trip")}}
  composable("trip") {if(trip.boat==null) LaunchedEffect(Unit){nav.popBackStack("fleet",false)} else TripScreen(trip,currency,vm::addOn){nav.navigate("payment")}}
  composable("payment") {if(trip.boat==null) LaunchedEffect(Unit){nav.popBackStack("fleet",false)} else PaymentScreen(trip,currency,vm::pay)}
  composable("passes") {MyPassScreen(bookings,currency){nav.navigate("pass/$it")}}
  composable("pass/{id}") { backStack -> PassScreen(bookings.find {it.id==backStack.arguments?.getString("id")},currency){vm.update {it.copy(completed=null)};nav.popBackStack("fleet",false)} }
 }
 } }
}
