package com.nautica.data
import android.content.Context
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import com.nautica.model.*
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
private val Context.store by preferencesDataStore("nautica")
class BookingRepository(private val context: Context) {
 private val tickets = stringPreferencesKey("bookings")
 private val money = stringPreferencesKey("currency")
 val bookings = context.store.data.map { p -> p[tickets]?.let { Json.decodeFromString<List<Booking>>(it) } ?: emptyList() }
 val currency = context.store.data.map { p -> Currency.entries.firstOrNull { it.name == p[money] } ?: Currency.INR }
 suspend fun currency(value: Currency) { context.store.edit { it[money] = value.name } }
 suspend fun save(booking: Booking) { context.store.edit { p -> val old = p[tickets]?.let { Json.decodeFromString<List<Booking>>(it) } ?: emptyList(); p[tickets] = Json.encodeToString((listOf(booking) + old).distinctBy { it.id }) } }
}
