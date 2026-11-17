package com.nautica
import com.nautica.model.*
import com.nautica.data.Fleet
import org.junit.Assert.*
import org.junit.Test
class ValidationTest {
 @Test fun validatesPaymentBoundaries() {
  assertTrue(Validation.upi("alex@okaxis"));assertFalse(Validation.upi("alex"));assertFalse(Validation.upi("@bank"))
  assertTrue(Validation.card("4242424242424242"));assertFalse(Validation.card("4242424242424241"));assertFalse(Validation.card(""));assertFalse(Validation.card("0000000000000000"))
  assertFalse(Validation.expiry("01/20"));assertFalse(Validation.expiry("13/99"));assertTrue(Validation.expiry("12/99"))
  assertTrue(Validation.cvv("378282246310005","1234"));assertFalse(Validation.cvv("378282246310005","123"))
 }
 @Test fun priceUsesFivePercentFeeOnFareAndExtras() {val boat=Fleet.boats.first();assertEquals(126000L,total(boat,setOf(AddOn.SAFETY)));assertEquals(168000L,total(boat,setOf(AddOn.SAFETY,AddOn.SNACKS)))}
 @Test fun currencyConvertsAllPaiseAtTheSameRate() {assertEquals("$14.46",Currency.USD.format(120000));assertEquals("$18.07",Currency.USD.format(AddOn.PHOTO.price))}
 @Test fun detectsNetworks() {assertEquals("VISA",Validation.network("4242"));assertEquals("MASTERCARD",Validation.network("2221"));assertEquals("AMEX",Validation.network("37"));assertEquals("RUPAY",Validation.network("60"))}
}
