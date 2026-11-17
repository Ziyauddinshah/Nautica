package com.nautica.viewmodel
import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.nautica.data.*
import com.nautica.model.*
import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class TripState(val pier: String = Fleet.piers[0], val date: String = LocalDate.now().plusDays(1).toString(), val slot: String = Fleet.slots[0], val type: String = "All", val guests: Int = 2, val boat: Boat? = null, val extras: Set<AddOn> = setOf(AddOn.SAFETY), val processing: Boolean = false, val error: String? = null, val completed: String? = null)
class NauticaViewModel(app: Application): AndroidViewModel(app) {
 private val repository = BookingRepository(app)
 private val mutable = MutableStateFlow(TripState())
 val trip = mutable.asStateFlow()
 val bookings = repository.bookings.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
 val currency = repository.currency.stateIn(viewModelScope, SharingStarted.Eagerly, Currency.INR)
 fun currency(value: Currency) { viewModelScope.launch { repository.currency(value) } }
 fun update(change: (TripState) -> TripState) { if (!mutable.value.processing) mutable.update(change) }
 fun select(boat: Boat) = update { it.copy(boat = boat, extras = setOf(AddOn.SAFETY), completed = null, error = null) }
 fun addOn(add: AddOn) = update { it.copy(extras = if (add in it.extras) it.extras - add else it.extras + add) }
 fun pay(name: String, method: String) {
  val snapshot = mutable.value
  val boat = snapshot.boat ?: return
  if (snapshot.processing || snapshot.completed != null || name.trim().length < 2 || snapshot.guests > boat.capacity || LocalDate.parse(snapshot.date) < LocalDate.now()) return
  mutable.update { it.copy(processing = true, error = null) }
  viewModelScope.launch {
   try {
    delay(2000)
    val booking = Booking("NTC-" + UUID.randomUUID().toString().take(8).uppercase(), boat, snapshot.date, snapshot.slot, snapshot.guests, name.trim(), snapshot.extras, total(boat, snapshot.extras), method)
    repository.save(booking)
    mutable.update { it.copy(processing = false, completed = booking.id) }
   } catch (cancelled: CancellationException) { throw cancelled } catch (_: Exception) { mutable.update { it.copy(processing = false, error = "Could not save your pass. Please try again.") } }
  }
 }
}
