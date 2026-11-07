import { useEffect, useState, type ChangeEvent } from 'react'
import { Input, Select } from './primitives'

const callingCodes = [
  { country: 'Uganda', iso: 'UG', dial: '+256' },
  { country: 'Kenya', iso: 'KE', dial: '+254' },
  { country: 'Tanzania', iso: 'TZ', dial: '+255' },
  { country: 'Rwanda', iso: 'RW', dial: '+250' },
  { country: 'Burundi', iso: 'BI', dial: '+257' },
  { country: 'South Sudan', iso: 'SS', dial: '+211' },
  { country: 'DR Congo', iso: 'CD', dial: '+243' },
  { country: 'Ethiopia', iso: 'ET', dial: '+251' },
  { country: 'Somalia', iso: 'SO', dial: '+252' },
  { country: 'United Kingdom', iso: 'GB', dial: '+44' },
  { country: 'United States', iso: 'US', dial: '+1' },
] as const

type CountryIso = typeof callingCodes[number]['iso']

function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

function parsePhone(value: string, defaultCountry: CountryIso) {
  const matchedCountry = [...callingCodes].sort((a, b) => b.dial.length - a.dial.length).find(({ dial }) => value.trim().startsWith(dial))
  const country = matchedCountry ?? callingCodes.find((item) => item.iso === defaultCountry) ?? callingCodes[0]
  const nationalPart = matchedCountry ? value.trim().slice(country.dial.length) : value
  let national = digitsOnly(nationalPart)
  if (!matchedCountry && national.startsWith('0')) national = national.slice(1)
  return { countryIso: country.iso, national }
}

export function PhoneNumberInput({
  value,
  onChange,
  defaultCountry = 'UG',
  placeholder = '772 123 456',
  id,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  defaultCountry?: CountryIso
  placeholder?: string
  id?: string
  disabled?: boolean
}) {
  const [countryIso, setCountryIso] = useState<CountryIso>(defaultCountry)
  const [national, setNational] = useState('')
  const country = callingCodes.find((item) => item.iso === countryIso) ?? callingCodes[0]

  useEffect(() => {
    const parsed = parsePhone(value, defaultCountry)
    setCountryIso(parsed.countryIso)
    setNational(parsed.national)
  }, [value, defaultCountry])

  function changeCountry(event: ChangeEvent<HTMLSelectElement>) {
    const next = callingCodes.find((item) => item.iso === event.target.value) ?? callingCodes[0]
    setCountryIso(next.iso)
    onChange(national ? `${next.dial} ${national}` : next.dial)
  }

  function changeNational(value: string) {
    let next = digitsOnly(value)
    const dialPrefix = country.dial.slice(1)
    if (next.startsWith(dialPrefix)) next = next.slice(dialPrefix.length)
    if (next.startsWith('0')) next = next.slice(1)
    next = next.slice(0, 12)
    setNational(next)
    onChange(next ? `${country.dial} ${next}` : country.dial)
  }

  return <div className="phone-number-input">
    <Select aria-label="Country calling code" value={country.iso} onChange={changeCountry} disabled={disabled} className="phone-country-select">
      {callingCodes.map((item) => <option key={item.iso} value={item.iso}>{item.country} {item.dial}</option>)}
    </Select>
    <Input id={id} type="tel" inputMode="numeric" autoComplete="tel-national" placeholder={placeholder} value={national} onChange={(event) => changeNational(event.target.value)} disabled={disabled} aria-label="National phone number" />
  </div>
}
