function unresolvedIssue(dayNumber, placeId, name) {
  return {
    code: 'UNRESOLVED_MAIN_PLACE',
    severity: 'error',
    dayNumber,
    placeId,
    message: `Day ${dayNumber} 主线地点“${name}”尚未确认`,
  }
}

function rolesFor(dayIndex, nodeIndex, nodeCount) {
  const roles = ['stop']
  if (dayIndex === 0 && nodeIndex === 0) roles.unshift('origin')
  if (nodeIndex === nodeCount - 1) roles.push('overnight')
  return roles
}

function narratedPoint(place, spec, dayIndex, nodeIndex, nodeCount) {
  return {
    ...place,
    placeId: spec.placeId,
    name: spec.name,
    narrationLevel: spec.narrationLevel,
    contentBrief: spec.contentBrief,
    imageIdentity: spec.imageIdentity,
    sourcePages: [...spec.sourcePages],
    narrate: true,
    roles: rolesFor(dayIndex, nodeIndex, nodeCount),
    routeType: 'main',
  }
}

function routeOrigin(place) {
  return {
    ...place,
    narrate: false,
    roles: ['origin', 'route'],
    routeType: 'main',
  }
}

function placeFor(spec, catalog) {
  return catalog?.get(spec.placeId) || spec.location || null
}

export function compileAuthoritative318Plan({ authority, catalog }) {
  const issues = []

  for (const day of authority?.days || []) {
    for (const spec of day.nodes || []) {
      if (!placeFor(spec, catalog)) {
        issues.push(unresolvedIssue(day.dayNumber, spec.placeId, spec.name))
      }
    }
  }

  if (issues.length) return { plan: null, issues }

  const days = authority.days.map((day, dayIndex) => {
    const listed = day.nodes.map((spec, nodeIndex) => narratedPoint(
      placeFor(spec, catalog),
      spec,
      dayIndex,
      nodeIndex,
      day.nodes.length,
    ))
    const previousEndId = dayIndex > 0 ? authority.days[dayIndex - 1].overnightPlaceId : null
    const waypoints = previousEndId
      ? [routeOrigin(catalog.get(previousEndId)), ...listed]
      : listed

    return {
      dayNumber: day.dayNumber,
      overnight: listed.at(-1)?.name || '',
      overnightPlaceId: day.overnightPlaceId,
      alternatives: authority.alternatives
        .filter((item) => item.dayNumber === day.dayNumber)
        .map((item) => ({ ...item })),
      waypoints,
      segments: null,
    }
  })

  return {
    plan: {
      presetId: 'fixed-318',
      routeDataVersion: authority.authorityVersion,
      name: '318 川藏线（成都 → 拉萨）',
      description: '依据用户审定权威底稿从零生成的九天主线。',
      days,
    },
    issues: [],
  }
}
