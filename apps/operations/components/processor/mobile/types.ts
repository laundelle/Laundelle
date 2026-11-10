export type MobileProcessorTab = 'scan' | 'orders' | 'history';

export interface MobileProcessorOrder {
  id: string;
  displayId: string;
  customerName: string;
  customerPhone: string;
  serviceType: string;
  weightKg: number;
  itemCount: number;
  currentStageIndex: number; // 0 to 7
  statusLabel: string;
  scannedAt?: string;
  totalAmount?: number;
}

export interface MobileCompletedJob {
  id: string;
  displayId: string;
  customerName: string;
  serviceType: string;
  itemCount: number;
  completedAt: string;
  rating: number;
  totalAmount: number;
}

export const PROCESSING_STAGES = [
  { id: 1, name: 'Intake Received', shortName: 'Intake' },
  { id: 2, name: 'Sorting & Grading', shortName: 'Sorting' },
  { id: 3, name: 'Washing Cycle', shortName: 'Washing' },
  { id: 4, name: 'Thermal Drying', shortName: 'Drying' },
  { id: 5, name: 'Steam Press & Ironing', shortName: 'Ironing' },
  { id: 6, name: 'Packaging & Folding', shortName: 'Folding' },
  { id: 7, name: 'Quality Inspection', shortName: 'QC' },
  { id: 8, name: 'Ready for Delivery', shortName: 'Ready' },
] as const;

