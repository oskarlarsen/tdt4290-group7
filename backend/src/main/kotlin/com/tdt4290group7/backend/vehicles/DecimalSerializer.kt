package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonUnquotedLiteral

/** JSON numbers in/out, with no intermediate binary floating-point conversion. */
object DecimalSerializer : KSerializer<BigDecimal> {
    override val descriptor = PrimitiveSerialDescriptor("ExactDecimal", PrimitiveKind.DOUBLE)

    override fun deserialize(decoder: Decoder): BigDecimal {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement() as? JsonPrimitive
            ?: throw SerializationException("Forventet et JSON-tall")
        if (element.isString || element.content.length > 80 ||
            !element.content.matches(Regex("-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?"))
        ) throw SerializationException("Forventet et JSON-tall")
        return try {
            BigDecimal(element.content).also { decimalParts(it) }
        } catch (_: IllegalArgumentException) {
            throw SerializationException("Tallet kan ikke være negativt og må ligge innenfor det støttede desimalområdet")
        } catch (_: ArithmeticException) {
            throw SerializationException("Tallet må ligge innenfor det støttede desimalområdet")
        }
    }

    @OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
    override fun serialize(encoder: Encoder, value: BigDecimal) {
        val json = encoder as? JsonEncoder ?: throw SerializationException("JSON is required")
        json.encodeJsonElement(JsonUnquotedLiteral(value.stripTrailingZeros().toPlainString()))
    }
}

data class DecimalParts(val unscaled: Long, val scale: Int)

/** At most 18 fractional places after removing insignificant zeroes; 64-bit coefficient. */
fun decimalParts(value: BigDecimal): DecimalParts {
    require(value.signum() >= 0) { "Målinger kan ikke være negative" }
    val normalized = value.stripTrailingZeros()
    require(normalized.scale() in -18..18) { "Målinger støtter høyst 18 desimaler" }
    val stored = if (normalized.scale() < 0) normalized.setScale(0) else normalized
    val unscaled = try {
        stored.unscaledValue().longValueExact()
    } catch (_: ArithmeticException) {
        throw IllegalArgumentException("Målingen er utenfor det støttede 64-bits desimalområdet")
    }
    return DecimalParts(unscaled, stored.scale())
}
