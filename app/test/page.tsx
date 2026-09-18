"use client"

import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Avatar } from '@heroui/react/avatar'
import { Chip } from '@heroui/react/chip'
import { Skeleton } from '@heroui/react/skeleton'
import { Separator } from '@heroui/react/separator'
import React, { useState, useEffect } from 'react'

type UserContact = {
  id: number
  created_at: string
  firstname: string
  middlename: null
  lastname: string
  birthdate: string
  contacts: [
    {
      id: number
      created_at: string
      phone: string | null
      email: string | null
      user_id: number
    }
  ]
}

function Page() {
  const [users, setUsers] = useState<UserContact[]>([])
  const [loading, setLoading] = useState(false)

  const fetchUsers = async () => {
    setLoading(true)
    const res = await fetch('/api/test')
    const data = await res.json()
    setUsers(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const getInitials = (user: UserContact) =>
    `${user.firstname[0] ?? ''}${user.lastname[0] ?? ''}`.toUpperCase()

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <Button onClick={fetchUsers} isDisabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
                <Separator className="my-3" />
                <Skeleton className="h-3 w-full" />
              </Card>
            ))
          : users.map((user) => (
              <Card key={user.id} className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar
                    // name={getInitials(user)}
                    className="size-10"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-sm">
                      {user.firstname} {user.lastname}
                    </p>
                    <p className="text-xs text-default-500">
                      Born {new Date(user.birthdate).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <Separator className="my-3" />

                <div className="flex flex-wrap gap-2">
                  {user.contacts[0]?.phone && (
                    <Chip variant='primary' size="sm">
                      📞 {user.contacts[0].phone}
                    </Chip>
                  )}
                  {user.contacts[0]?.email && (
                    <Chip variant='primary' size="sm">
                      ✉️ {user.contacts[0].email}
                    </Chip>
                  )}
                </div>
              </Card>
            ))}
      </div>

      {/* Empty state */}
      {!loading && users.length === 0 && (
        <p className="text-center text-default-400 py-8">
          No contacts yet. Click <strong>Refresh</strong> to load.
        </p>
      )}
    </div>
  )
}

export default Page   