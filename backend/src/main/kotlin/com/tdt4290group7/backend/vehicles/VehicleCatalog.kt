package com.tdt4290group7.backend.vehicles

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Official SVV codes, with application-owned English labels. Update both clients together. */
@Serializable
enum class FuelTechnology(val code: String, val label: String) {
    @SerialName("1") GASOLINE("1", "Gasoline"),
    @SerialName("2") DIESEL("2", "Diesel"),
    @SerialName("3") KEROSENE("3", "Kerosene"),
    @SerialName("4") GAS("4", "Gas"),
    @SerialName("5") ELECTRIC("5", "Electric"),
    @SerialName("6") HYDROGEN("6", "Hydrogen"),
    @SerialName("7") GASOLINE_HYBRID("7", "Gasoline hybrid"),
    @SerialName("8") DIESEL_HYBRID("8", "Diesel hybrid"),
    @SerialName("9") OTHER("9", "Other fuel"),
    @SerialName("10") BIODIESEL("10", "Biodiesel"),
    @SerialName("11") BIOGASOLINE("11", "Biogasoline"),
    @SerialName("12") LPG("12", "LPG"),
    @SerialName("13") CNG("13", "CNG"),
    @SerialName("14") METHANOL("14", "Methanol"),
    @SerialName("21") LNG("21", "LNG"),
    /** Local sentinel: deliberately not presented as an official SVV code. */
    NOT_APPLICABLE("NOT_APPLICABLE", "Not applicable - unpowered trailer");

    val usesLitres: Boolean get() = this !in listOf(ELECTRIC, HYDROGEN, NOT_APPLICABLE)
    /** Application reporting convention, not a claim about every hydrogen powertrain. */
    val locksEmissionsToZero: Boolean get() = this in listOf(ELECTRIC, HYDROGEN)
    companion object { fun fromCode(code: String) = entries.first { it.code == code } }
}

/** Input scope: cars, buses, goods vehicles and trailers. SVV observations remain open-ended. */
@Serializable
enum class VehicleCategory(val label: String) {
    M1("Passenger car"),
    M2("Bus, maximum permitted weight up to 5,000 kg"),
    M3("Bus, maximum permitted weight over 5,000 kg"),
    N1("Van, maximum permitted weight up to 3,500 kg"),
    N2("Truck, maximum permitted weight over 3,500 to 12,000 kg"),
    N3("Truck, maximum permitted weight over 12,000 kg"),
    O1("Trailer, maximum permitted weight up to 750 kg"), O2("Trailer, over 750 to 3,500 kg"),
    O3("Trailer, over 3,500 to 10,000 kg"), O4("Trailer, over 10,000 kg");

    val isTrailer: Boolean get() = name.startsWith("O")
}

@Serializable
enum class BodyType(val label: String) {
    AA("Sedan"), AB("Hatchback"), AC("Station wagon"), AD("Coupe"), AE("Convertible"),
    AF("Multi-purpose vehicle"), AG("Double cab"), ANNET("Other body type"), APEN("Open body"),
    BA("Truck with separate cab"), BB("Van with integrated cab"), BC("Semi-trailer tractor"),
    BD("Trailer tractor"), BE("Pickup"), BX("Chassis with or without cab"),
    CA("Single-deck bus or coach"), CB("Double-deck bus or coach"),
    CC("Single-deck articulated bus or coach"), CD("Double-deck articulated bus or coach"),
    CE("Single-deck low-floor bus or coach"), CF("Double-deck low-floor bus or coach"),
    CG("Single-deck articulated low-floor bus or coach"), CH("Double-deck articulated low-floor bus or coach"),
    CI("Open single-deck bus or coach"), CJ("Open double-deck bus or coach"),
    CM("Single-deck low-floor bus"), CO("Single-deck articulated low-floor bus"),
    CQ("Single-deck bus"), CR("Double-deck bus"), CS("Single-deck articulated bus"),
    CT("Double-deck articulated bus"), CU("Single-deck bus"), CV("Single-deck low-floor bus"),
    CW("Single-deck bus"), CX("Bus chassis"), DA("Semi-trailer"), DB("Drawbar trailer"),
    DC("Centre-axle trailer"), DE("Rigid-drawbar trailer"), HARDTOP("Hardtop"),
    IKKE_FORERVERN("No driver protection"), IKKE_KAROSSERI("No bodywork"),
    LUKKET("Closed body"), LUKKET_FORERVERN("Enclosed driver protection"),
    SA("Motorhome"), SB("Armoured vehicle"), SC("Ambulance"), SD("Hearse"),
    SE("Caravan"), SF("Mobile crane"), SG("Special-purpose vehicle"), SH("Wheelchair-accessible vehicle"),
    SJ("Trailer dolly"), SK("Oversize special trailer"), SL("Terminal tractor"),
    SM("Goods vehicle for interchangeable equipment"), VELTEBOYLE("Rollover protection bar");
}

/** Comparison groups never overwrite the original SVV observation. */
internal fun fuelGroups(code: String): Set<String> = when (code) {
    "16", "17" -> setOf("12")
    "18", "19" -> setOf("13")
    "22" -> setOf("13", "21")
    else -> setOf(code)
}
internal fun categoryGroup(code: String): String =
    if (code in setOf("M1G", "M2G", "M3G", "N1G", "N2G", "N3G")) code.dropLast(1) else code
internal fun fuelCode(code: String) = RegistryCode(code,
    FuelTechnology.entries.find { it.code == code }?.label ?: when (code) {
        "15" -> "Ethanol"; "16" -> "LPG A"; "17" -> "LPG B"; "18" -> "CNG 20"
        "19" -> "CNG 25"; "20" -> "Compressed air"; "22" -> "CNG and LNG"; else -> null
    })
internal fun categoryCode(code: String) = RegistryCode(code, VehicleCategory.entries.find { it.name == categoryGroup(code) }?.label)
internal fun bodyCode(code: String) = RegistryCode(code, BodyType.entries.find { it.name == code }?.label)
