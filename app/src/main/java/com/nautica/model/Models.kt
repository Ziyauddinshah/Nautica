package com.nautica.model

import kotlinx.serialization.Serializable
import java.text.NumberFormat
import java.util.Locale
import java.time.LocalDate
import java.time.YearMonth

@Serializable enum class Currency { INR, USD;
    fun format(inr: Long): String = NumberFormat.getCurrencyInstance(if (this == INR) Locale("en", "IN") else Locale.US).apply { maximumFractionDigits = 2 }.format(if (this == INR) inr / 100.0 else inr / 8300.0)
}
@Serializable data class Boat(val id: String, val name: String, val pier: String, val type: String, val capacity: Int, val fare: Long, val rating: String, val reviews: Int, val amenities: List<String>)
@Serializable enum class AddOn(val title: String, val price: Long) {
    SAFETY("Extra life vests & safety kit", 0), SNACKS("Refreshments & snacks", 40000), PHOTO("Professional photographer", 150000), GUIDE("Local heritage guide", 80000)
}
@Serializable data class Booking(val id: String, val boat: Boat, val date: String, val slot: String, val guests: Int, val name: String, val extras: Set<AddOn>, val total: Long, val method: String)
fun subtotal(boat: Boat, extras: Set<AddOn>) = boat.fare + extras.sumOf { it.price }
fun total(boat: Boat, extras: Set<AddOn>) = subtotal(boat, extras) + (subtotal(boat, extras) * 5 + 50) / 100
object Validation {
    fun upi(value: String) = Regex("[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9.-]{1,}").matches(value.trim())
    fun network(number: String): String = when { number.startsWith("4") -> "VISA"; number.startsWith("34") || number.startsWith("37") -> "AMEX"; (number.take(2).toIntOrNull() ?: -1) in 51..55 || (number.take(4).toIntOrNull() ?: -1) in 2221..2720 -> "MASTERCARD"; number.startsWith("60") || number.startsWith("65") || number.startsWith("81") || number.startsWith("82") -> "RUPAY"; else -> "CARD" }
    fun card(number: String): Boolean {
        if (number.length !in 13..19 || !number.all(Char::isDigit) || number.toSet().size == 1) return false
        return number.reversed().mapIndexed { i, c -> val n = c.digitToInt() * if (i % 2 == 1) 2 else 1; if (n > 9) n - 9 else n }.sum() % 10 == 0
    }
    fun expiry(value: String): Boolean = try { val parts = value.split("/"); parts.size == 2 && parts[0].length == 2 && parts[1].length == 2 && YearMonth.of(2000 + parts[1].toInt(), parts[0].toInt()) >= YearMonth.now() } catch (_: Exception) { false }
    fun cvv(number: String, value: String) = value.all(Char::isDigit) && value.length == if (network(number) == "AMEX") 4 else 3
}
