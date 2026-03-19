// =============================================================================
// Distillation V2 — Enhanced daily distillation with source weight updates
// =============================================================================
// Extends the original DistillationEngine with:
//   1. Source reliability profile recomputation (all sources)
//   2. Calibration audit for all analysts
//   3. Attribution rebuild (from Sprint 1)
//   4. Log a summary to brain observations
//
// Replaces DistillationEngine in the scheduler.
// =============================================================================

import { BrainStore, DistillationResult } from './brain-store';
import { DistillationEngine } from './distillation';
import { SourceProfiler } from './source-profiles';
import { ConfidenceCalibrator } from './confidence-calibrator';
import { AttributionStore } from '../allocation/attribution-store';
import { StrategyRoleRegistry } from '../allocation/strategy-roles';

export interface DistillationV2Result extends DistillationResult {
  profilesUpdated: number;
  calibrationReports: number;
  rolesPromoted: string[];
  rolesDemoted: string[];
  attributionRebuilt: boolean;
}

export class DistillationV2Engine extends DistillationEngine {
  private profiler: SourceProfiler;
  private calibrator: ConfidenceCalibrator;
  private roleRegistry: StrategyRoleRegistry | null;

  constructor(
    brain: BrainStore,
    attrStore: AttributionStore,
    profiler: SourceProfiler,
    roleRegistry?: StrategyRoleRegistry | null,
  ) {
    super(brain, attrStore);
    this.profiler = profiler;
    this.calibrator = new ConfidenceCalibrator(brain.getDatabase());
    this.roleRegistry = roleRegistry || null;
  }

  /**
   * Run the full v2 distillation:
   *   1. Original pattern promotion (inherited)
   *   2. Rebuild daily attribution (inherited from Sprint 1 modification)
   *   3. Update all source reliability profiles
   *   4. Run calibration audit for all analysts
   *   5. Log summary observation
   */
  runDistillationV2(): DistillationV2Result {
    console.log('🧪 Distillation V2: Starting enhanced daily cycle...');

    // Step 1 + 2: Original distillation (patterns + attribution)
    const baseResult = this.runDistillation();

    // Step 3: Update source reliability profiles
    let profilesUpdated = 0;
    try {
      profilesUpdated = this.profiler.updateAllProfiles();
      console.log(`📊 Source profiles updated: ${profilesUpdated} sources`);

      // Log profile summaries
      const profiles = this.profiler.getAllProfiles();
      for (const p of profiles) {
        const status = p.reliabilityScore >= 0.6 ? '✅' :
                       p.reliabilityScore >= 0.4 ? '⚠️' : '🔴';
        console.log(`   ${status} ${p.sourceId}: reliability=${p.reliabilityScore.toFixed(2)}, winRate=${(p.trailingWinRate * 100).toFixed(0)}%, trades=${p.tradeCount}`);
      }
    } catch (e: any) {
      console.warn('⚠️  Source profile update failed:', e.message);
    }

    // Step 4: Calibration audit
    let calibrationReports = 0;
    try {
      const reports = this.calibrator.calibrateAll();
      calibrationReports = reports.length;

      for (const report of reports) {
        if (report.totalTrades >= 5) {
          const emoji = report.score >= 0.7 ? '🎯' : report.score >= 0.4 ? '📐' : '⚠️';
          console.log(`   ${emoji} ${report.analystId} calibration: ${(report.score * 100).toFixed(0)}% — ${report.recommendation.split('.')[0]}`);
        }
      }
    } catch (e: any) {
      console.warn('⚠️  Calibration audit failed:', e.message);
    }

    // Step 5: Auto-adjust strategy roles based on reliability profiles
    let rolesPromoted: string[] = [];
    let rolesDemoted: string[] = [];
    if (this.roleRegistry && profilesUpdated > 0) {
      try {
        const profiles = this.profiler.getAllProfiles();
        const adjustments = this.roleRegistry.autoAdjustRoles(profiles);
        rolesPromoted = adjustments.promoted;
        rolesDemoted = adjustments.demoted;
      } catch (e: any) {
        console.warn('⚠️  Role auto-adjustment failed:', e.message);
      }
    }

    console.log(`🧪 Distillation V2 complete: ${baseResult.promoted} promoted, ${baseResult.avoidPatterns} avoid, ${profilesUpdated} profiles, ${calibrationReports} calibrations, ${rolesPromoted.length} role promotions, ${rolesDemoted.length} role demotions`);

    return {
      ...baseResult,
      profilesUpdated,
      calibrationReports,
      rolesPromoted,
      rolesDemoted,
      attributionRebuilt: true,
    };
  }
}
