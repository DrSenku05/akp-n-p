import { Button } from '@heroui/react'
import clsx from 'clsx'
import React from 'react'

type Props = {
  text: string
  icon?: React.ReactNode
  active?: boolean
  className?: string
  onClick?: () => void
}

function GoodButton({ text, icon, active, className, onClick }: Props) {
  return (
    <Button
      variant={active ? 'primary' : 'outline'}
      size="sm"
      fullWidth
      className={clsx(
        'justify-start rounded-md',
        active && 'bg-default-200 dark:bg-default-100 font-medium',
        className,
      )}
      onClick={onClick}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{text}</span>
    </Button>
  )
}

export default GoodButton   