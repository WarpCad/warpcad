// SPDX-License-Identifier: AGPL-3.0-or-later
import { computed } from 'vue'

import { tallyBom } from '../core/bom.js'
import { useObjectListStore } from '../stores/objectList.js'

/**
 * The live Bill of Materials (`TODO/ui-038`): the scene as announced, tallied.
 *
 * Reads the same source the Objects list does — the previewed prefix while History is
 * previewing, else the live document — so the BOM can never list a part the scene does
 * not show. The tally itself is `core/bom.js`; this is only the reactive seam.
 *
 * @returns {{ rows: import('vue').ComputedRef<import('../core/bom.js').BomRow[]>, total: import('vue').ComputedRef<number> }}
 */
export function useBillOfMaterials() {
  const objectList = useObjectListStore()
  const rows = computed(() => tallyBom(objectList.bodies))
  const total = computed(() => rows.value.reduce((sum, row) => sum + row.count, 0))
  return { rows, total }
}
