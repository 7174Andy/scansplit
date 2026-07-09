import * as React from "react"
import { Calendar as CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatDate } from "@/lib/formatDate"
import { isoToDate, dateToIso } from "@/lib/calendarDate"

export function DatePicker({
  value,
  onChange,
  id,
}: {
  value: string // YYYY-MM-DD (always present)
  onChange: (iso: string) => void // receives YYYY-MM-DD
  id?: string
}) {
  const [open, setOpen] = React.useState(false)
  const selected = isoToDate(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="w-48 justify-start font-normal"
        >
          <CalendarIcon className="size-4" />
          {formatDate(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            // Required field: ignore deselect (undefined), keep current value.
            if (d) {
              onChange(dateToIso(d))
              setOpen(false)
            }
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
