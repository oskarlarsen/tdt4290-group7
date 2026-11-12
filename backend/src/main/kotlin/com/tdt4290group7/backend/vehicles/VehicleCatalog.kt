package com.tdt4290group7.backend.vehicles

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Official SVV codes, with application-owned Norwegian labels. Update both clients together. */
@Serializable
enum class FuelTechnology(val code: String, val label: String) {
    @SerialName("1") GASOLINE("1", "Bensin"),
    @SerialName("2") DIESEL("2", "Diesel"),
    @SerialName("3") KEROSENE("3", "Parafin"),
    @SerialName("4") GAS("4", "Gass"),
    @SerialName("5") ELECTRIC("5", "Elektrisk"),
    @SerialName("6") HYDROGEN("6", "Hydrogen"),
    @SerialName("7") GASOLINE_HYBRID("7", "Bensinhybrid"),
    @SerialName("8") DIESEL_HYBRID("8", "Dieselhybrid"),
    @SerialName("9") OTHER("9", "Annet drivstoff"),
    @SerialName("10") BIODIESEL("10", "Biodiesel"),
    @SerialName("11") BIOGASOLINE("11", "Biobensin"),
    @SerialName("12") LPG("12", "LPG"),
    @SerialName("13") CNG("13", "CNG"),
    @SerialName("14") METHANOL("14", "Metanol"),
    @SerialName("21") LNG("21", "LNG"),
    /** Local sentinel: deliberately not presented as an official SVV code. */
    NOT_APPLICABLE("NOT_APPLICABLE", "Ikke relevant - tilhenger uten motor");

    val usesLitres: Boolean get() = this !in listOf(ELECTRIC, HYDROGEN, NOT_APPLICABLE)
    /** Reporting applicability, not a claim about every hydrogen powertrain. */
    val emissionsNotApplicable: Boolean get() = this in listOf(ELECTRIC, HYDROGEN)
    companion object { fun fromCode(code: String) = entries.first { it.code == code } }
}

/** Input scope: cars, buses, goods vehicles and trailers. SVV observations remain open-ended. */
@Serializable
enum class VehicleCategory(val label: String) {
    M1("Personbil"),
    M2("Buss, tillatt totalvekt opptil 5 000 kg"),
    M3("Buss, tillatt totalvekt over 5 000 kg"),
    N1("Varebil, tillatt totalvekt opptil 3 500 kg"),
    N2("Lastebil, tillatt totalvekt over 3 500 til 12 000 kg"),
    N3("Lastebil, tillatt totalvekt over 12 000 kg"),
    O1("Tilhenger, tillatt totalvekt opptil 750 kg"), O2("Tilhenger, over 750 til 3 500 kg"),
    O3("Tilhenger, over 3 500 til 10 000 kg"), O4("Tilhenger, over 10 000 kg");

    val isTrailer: Boolean get() = name.startsWith("O")
}

@Serializable
enum class BodyType(val label: String) {
    AA("Sedan"), AB("Kombikupé"), AC("Stasjonsvogn"), AD("Kupé"), AE("Kabriolet"),
    AF("Flerbruksbil"), AG("Dobbel kabin"), ANNET("Annen karosseritype"), APEN("Åpen karosseri"),
    BA("Lastebil med separat førerhus"), BB("Varebil med integrert førerhus"), BC("Trekkbil for semitrailer"),
    BD("Trekkbil for tilhenger"), BE("Pickup"), BX("Chassis med eller uten førerhus"),
    CA("Enkeltdekkerbuss eller turbuss"), CB("Dobbeltdekkerbuss eller turbuss"),
    CC("Leddbuss, enkeltdekker, eller turbuss"), CD("Leddbuss, dobbeltdekker, eller turbuss"),
    CE("Lavgulvbuss, enkeltdekker, eller turbuss"), CF("Lavgulvbuss, dobbeltdekker, eller turbuss"),
    CG("Lavgulv leddbuss, enkeltdekker, eller turbuss"), CH("Lavgulv leddbuss, dobbeltdekker, eller turbuss"),
    CI("Åpen enkeltdekkerbuss eller turbuss"), CJ("Åpen dobbeltdekkerbuss eller turbuss"),
    CM("Lavgulvbuss, enkeltdekker"), CO("Lavgulv leddbuss, enkeltdekker"),
    CQ("Enkeltdekkerbuss"), CR("Dobbeltdekkerbuss"), CS("Leddbuss, enkeltdekker"),
    CT("Leddbuss, dobbeltdekker"), CU("Enkeltdekkerbuss"), CV("Lavgulvbuss, enkeltdekker"),
    CW("Enkeltdekkerbuss"), CX("Busschassis"), DA("Semitrailer"), DB("Tilhenger med dragstang"),
    DC("Sentralakslet tilhenger"), DE("Tilhenger med stiv dragstang"), HARDTOP("Hardtop"),
    IKKE_FORERVERN("Ingen førervern"), IKKE_KAROSSERI("Ingen karosseri"),
    LUKKET("Lukket karosseri"), LUKKET_FORERVERN("Lukket førervern"),
    SA("Bobil"), SB("Pansret kjøretøy"), SC("Ambulanse"), SD("Likbil"),
    SE("Campingvogn"), SF("Mobilkran"), SG("Spesialkjøretøy"), SH("Rullestolegnet kjøretøy"),
    SJ("Dolly"), SK("Spesialtilhenger for overmål"), SL("Terminaltraktor"),
    SM("Lastebil for utskiftbart utstyr"), VELTEBOYLE("Veltebøyle");
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
        "15" -> "Etanol"; "16" -> "LPG A"; "17" -> "LPG B"; "18" -> "CNG 20"
        "19" -> "CNG 25"; "20" -> "Trykkluft"; "22" -> "CNG og LNG"; else -> null
    })
internal fun categoryCode(code: String) = RegistryCode(code, VehicleCategory.entries.find { it.name == categoryGroup(code) }?.label)
internal fun bodyCode(code: String) = RegistryCode(code, BodyType.entries.find { it.name == code }?.label)
