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
            ?: throw SerializationException("Expected a JSON number")
        if (element.isString || element.content.length > 80 ||
            !element.content.matches(Regex("-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?"))
        ) throw SerializationException("Expected a JSON number")
        return try {
            BigDecimal(element.content).also { decimalParts(it) }
        } catch (_: IllegalArgumentException) {
            throw SerializationException("Number must be non-negative and fit the supported decimal range")
        } catch (_: ArithmeticException) {
            throw SerializationException("Number must fit the supported decimal range")
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
    require(value.signum() >= 0) { "Measurements must be non-negative" }
    val normalized = value.stripTrailingZeros()
    require(normalized.scale() in -18..18) { "Measurements support at most 18 fractional places" }
    val stored = if (normalized.scale() < 0) normalized.setScale(0) else normalized
    val unscaled = try {
        stored.unscaledValue().longValueExact()
    } catch (_: ArithmeticException) {
        throw IllegalArgumentException("Measurement exceeds the supported 64-bit decimal range")
    }
    return DecimalParts(unscaled, stored.scale())
}
