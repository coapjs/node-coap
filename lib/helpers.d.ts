import { Option, OptionValue } from ".."
import { OptionName } from "coap-packet"

export function getOption(options: Option[], name: OptionName): OptionValue | null
export function setOption(name: OptionName, values: OptionValue): any
