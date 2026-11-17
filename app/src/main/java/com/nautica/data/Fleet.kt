package com.nautica.data
import com.nautica.model.Boat
object Fleet {
 val piers = listOf("Assi Ghat", "Dashashwamedh Ghat", "Marina Bay", "Lake Como")
 val types = listOf("All", "Hand-rowed Wooden Boat", "Luxury Motor Yacht", "Pontoon Party Boat", "Speedboat")
 val slots = listOf("Sunrise · 5:30 AM", "Morning · 9:00 AM", "Sunset · 5:00 PM", "Evening · 7:30 PM")
 val boats = listOf(
 Boat("b1", "Ganges Dawn", piers[0], types[1], 6, 120000, "4.9", 128, listOf("Canopy shade", "Life jackets")),
 Boat("b2", "River Reverie", piers[0], types[3], 24, 650000, "4.8", 96, listOf("Bluetooth audio", "Canopy shade", "Life jackets")),
 Boat("b3", "Sacred Current", piers[1], types[1], 8, 160000, "4.9", 214, listOf("Heritage route", "Life jackets")),
 Boat("b4", "Aarti Voyager", piers[1], types[3], 30, 850000, "4.8", 173, listOf("Bluetooth audio", "Life jackets")),
 Boat("b5", "Marina Eclipse", piers[2], types[2], 12, 4150000, "5.0", 84, listOf("Sun deck", "Lounge", "Life jackets")),
 Boat("b6", "Bay Sprint", piers[2], types[4], 6, 1245000, "4.7", 62, listOf("Coastal tour", "Life jackets")),
 Boat("b7", "Bellagio Pearl", piers[3], types[2], 10, 4980000, "4.9", 116, listOf("Sun deck", "Bluetooth audio", "Life jackets")),
 Boat("b8", "Como Riva", piers[3], types[4], 5, 2075000, "4.9", 91, listOf("Villa route", "Life jackets")))
}
