import {
  AirVent,
  CookingPot,
  Coffee,
  Droplets,
  Fan,
  Lamp,
  LucideIcon,
  Microwave,
  Monitor,
  Plug,
  Refrigerator,
  Router,
  Tv,
  WashingMachine,
} from 'lucide-react';
import { ApplianceItem } from '../types/electrical';

const BY_NAME: [RegExp, LucideIcon][] = [
  [/hladnjak|zamrziva/i, Refrigerator],
  [/mikrovaln/i, Microwave],
  [/pećnic|ploč|štednjak/i, CookingPot],
  [/perilica/i, WashingMachine],
  [/klima/i, AirVent],
  [/bojler/i, Droplets],
  [/televizor|tv\b/i, Tv],
  [/računal|monitor/i, Monitor],
  [/usmjeriv|router|wi-?fi/i, Router],
  [/lamp|svjetl/i, Lamp],
  [/napa/i, Fan],
  [/kuhalo|espresso|kav/i, Coffee],
];

const BY_CATEGORY: Record<ApplianceItem['category'], LucideIcon> = {
  kuhinja: CookingPot,
  klima_grijanje: AirVent,
  multimedija: Tv,
  rasvjeta: Lamp,
  ostalo: Plug,
};

export function applianceIcon(app: Pick<ApplianceItem, 'name' | 'category'>): LucideIcon {
  return BY_NAME.find(([pattern]) => pattern.test(app.name))?.[1] ?? BY_CATEGORY[app.category];
}
