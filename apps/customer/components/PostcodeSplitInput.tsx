'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, Loader2, MapPin, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { dbSearchPostcodeDistricts, dbFetchActiveDistricts, checkPostcodeCoverage, dbFetchSlots } from '@laundelle/api-client';
import { extractOutwardCode } from '@laundelle/utils';

export interface PostcodeSplitInputProps {
  initialValue?: string; // e.g. "PR1 2AB"
  onChange?: (fullPostcode: string, outward: string, inward: string) => void;
  onAvailabilityChange?: (status: {
    isChecking: boolean;
    isServiceable: boolean | null;
    plantName?: string | null;
    slotsCount?: number;
    postcode: string;
  }) => void;
  required?: boolean;
  className?: string;
  showLiveStatus?: boolean;
}

export const PostcodeSplitInput: React.FC<PostcodeSplitInputProps> = ({
  initialValue = '',
  onChange,
  onAvailabilityChange,
  required = false,
  className = '',
  showLiveStatus = true,
}) => {
  // Parse initial value into outward & inward parts if provided
  const parsedInitialOutward = initialValue ? extractOutwardCode(initialValue).toUpperCase() : '';
  const parsedInitialInward = initialValue
    ? initialValue.replace(new RegExp(`^${parsedInitialOutward}\\s*`, 'i'), '').trim().toUpperCase()
    : '';

  const [selectedOutward, setSelectedOutward] = useState<string>(parsedInitialOutward);
  const [inwardCode, setInwardCode] = useState<string>(parsedInitialInward);

  // Dropdown & Search state for outward code
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [activeDistricts, setActiveDistricts] = useState<string[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // Availability checking state
  const [isChecking, setIsChecking] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState<{
    isServiceable: boolean | null;
    plantName?: string | null;
    slotsCount?: number;
    checkedPostcode?: string;
  }>({
    isServiceable: null,
    plantName: null,
    slotsCount: 0,
    checkedPostcode: ''
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Pre-load active plant service districts so dropdown has instant options on open
  useEffect(() => {
    let mounted = true;
    dbFetchActiveDistricts().then((districts) => {
      if (mounted && Array.isArray(districts)) {
        setActiveDistricts(districts.map((d) => extractOutwardCode(d).toUpperCase()).filter(Boolean));
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Update internal states if initialValue changes externally
  useEffect(() => {
    if (initialValue) {
      const out = extractOutwardCode(initialValue).toUpperCase();
      const inw = initialValue.replace(new RegExp(`^${out}\\s*`, 'i'), '').trim().toUpperCase();
      if (out && out !== selectedOutward) setSelectedOutward(out);
      if (inw !== inwardCode) setInwardCode(inw);
    }
  }, [initialValue]);

  // Debounced search for outward districts using dbSearchPostcodeDistricts (same API as plant creation)
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setLoadingSearch(false);
      return;
    }

    setLoadingSearch(true);
    const timer = setTimeout(async () => {
      try {
        const data = await dbSearchPostcodeDistricts(trimmed);
        const normalizedSet = new Set<string>();
        (data || []).forEach((item) => {
          const out = extractOutwardCode(item);
          if (out) normalizedSet.add(out.toUpperCase());
        });

        // Also include typed outward code if it matches standard outward pattern
        const typedOut = extractOutwardCode(trimmed).toUpperCase();
        if (typedOut && typedOut.length >= 2) {
          normalizedSet.add(typedOut);
        }

        setSearchResults(Array.from(normalizedSet));
      } catch (err) {
        console.error('Error searching postcode districts:', err);
        setSearchResults([]);
      } finally {
        setLoadingSearch(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Combined full postcode
  const fullPostcode = selectedOutward ? `${selectedOutward} ${inwardCode}`.trim() : '';

  // Propagate changes upwards
  useEffect(() => {
    if (onChange) {
      onChange(fullPostcode, selectedOutward, inwardCode);
    }
  }, [fullPostcode, selectedOutward, inwardCode]);

  // Live slot availability check when outward code is selected
  useEffect(() => {
    if (!selectedOutward) {
      setAvailabilityResult({ isServiceable: null, plantName: null, slotsCount: 0, checkedPostcode: '' });
      if (onAvailabilityChange) {
        onAvailabilityChange({ isChecking: false, isServiceable: null, postcode: '' });
      }
      return;
    }

    let isMounted = true;
    const checkAvailability = async () => {
      setIsChecking(true);
      if (onAvailabilityChange) {
        onAvailabilityChange({ isChecking: true, isServiceable: null, postcode: fullPostcode });
      }

      try {
        const coverage = await checkPostcodeCoverage(fullPostcode);
        const slots = await dbFetchSlots({ postcode: fullPostcode });
        
        if (isMounted) {
          const serviceable = coverage.isServiceable || slots.length > 0;
          const plant = coverage.plantName || (slots.length > 0 ? slots[0]?.plant_name : null);

          const result = {
            isServiceable: serviceable,
            plantName: plant,
            slotsCount: slots.length,
            checkedPostcode: fullPostcode
          };
          setAvailabilityResult(result);

          if (onAvailabilityChange) {
            onAvailabilityChange({
              isChecking: false,
              isServiceable: serviceable,
              plantName: plant,
              slotsCount: slots.length,
              postcode: fullPostcode
            });
          }
        }
      } catch (e) {
        console.error('Error checking postcode slot availability:', e);
        if (isMounted) {
          setAvailabilityResult({ isServiceable: false, plantName: null, slotsCount: 0, checkedPostcode: fullPostcode });
          if (onAvailabilityChange) {
            onAvailabilityChange({ isChecking: false, isServiceable: false, postcode: fullPostcode });
          }
        }
      } finally {
        if (isMounted) setIsChecking(false);
      }
    };

    const timer = setTimeout(checkAvailability, 300);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [selectedOutward, inwardCode]);

  const handleSelectOutward = (outward: string) => {
    const clean = extractOutwardCode(outward).toUpperCase();
    if (!clean) return;
    setSelectedOutward(clean);
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleClearOutward = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOutward('');
    setSearchQuery('');
    setAvailabilityResult({ isServiceable: null, plantName: null, slotsCount: 0, checkedPostcode: '' });
    setIsOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  // Determine list to display in outward dropdown
  const displayDropdownList = searchQuery.trim()
    ? searchResults
    : activeDistricts.length > 0
    ? activeDistricts
    : ['PR1', 'PR2', 'M1', 'BD2', 'SW1A', 'EC1A'];

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Two-Part Grid: Outward Code Dropdown + Inward Code Input */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        
        {/* PART 1: OUTWARD CODE (DROPDOWN FROM PLANT CREATION API) */}
        <div ref={containerRef} className="relative">
          <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
            1. Outward Code <span className="text-red-500">*</span>
            <span className="text-[10px] font-normal text-slate-400 lowercase ml-1">(select from dropdown)</span>
          </label>

          {/* Trigger / Display Box */}
          <div
            onClick={() => {
              setIsOpen(true);
              setTimeout(() => searchInputRef.current?.focus(), 50);
            }}
            className={`w-full min-h-[44px] px-3 py-2 bg-white rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer shadow-xs ${
              isOpen
                ? 'border-[#002953] ring-2 ring-[#002953]/15'
                : selectedOutward
                ? 'border-blue-300 bg-blue-50/30'
                : 'border-slate-300 hover:border-slate-400'
            }`}
          >
            {selectedOutward ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[#002953] text-white flex items-center justify-center font-mono font-medium text-xs shrink-0 shadow-2xs">
                  {selectedOutward.slice(0, 2)}
                </span>
                <span className="font-mono font-medium text-base text-[#002953] tracking-wider">
                  {selectedOutward}
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  Selected
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
                <Search className="w-3.5 h-3.5" />
                <span>Select area outward code...</span>
              </div>
            )}

            <div className="flex items-center gap-1 shrink-0">
              {selectedOutward && (
                <button
                  type="button"
                  onClick={handleClearOutward}
                  className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-700 transition-colors"
                  title="Clear outward code"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>

          {/* Dropdown Menu */}
          {isOpen && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
              {/* Search Header */}
              <div className="p-2.5 bg-slate-50 border-b border-slate-100 sticky top-0 z-10 space-y-1.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                    placeholder="Search outward code (e.g. PR1, M1, BD2)..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold uppercase placeholder:font-sans placeholder:normal-case placeholder:font-normal focus:outline-none focus:border-[#002953]"
                  />
                  {loadingSearch && (
                    <Loader2 className="w-3.5 h-3.5 text-[#002953] animate-spin absolute right-2.5 top-1/2 -translate-y-1/2" />
                  )}
                </div>
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 px-1">
                  <span>{searchQuery.trim() ? 'Search Results' : 'Active Plant Service Districts'}</span>
                  <span className="text-[9px] text-slate-400">Click to select</span>
                </div>
              </div>

              {/* District Options List */}
              <div className="divide-y divide-slate-100">
                {displayDropdownList.length > 0 ? (
                  displayDropdownList.map((district) => {
                    const isSelected = selectedOutward === district;
                    return (
                      <button
                        key={district}
                        type="button"
                        onClick={() => handleSelectOutward(district)}
                        className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50 text-[#002953] font-extrabold'
                            : 'hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                            isSelected ? 'bg-[#002953] text-white' : 'bg-slate-100 text-slate-700'
                          }`}>
                            <MapPin className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="font-mono font-bold text-sm">{district}</span>
                            <span className="text-[11px] text-slate-400 ml-2 font-normal">Outward District</span>
                          </div>
                        </div>

                        {isSelected ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                            <Check className="w-3.5 h-3.5 stroke-[3]" /> Selected
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-[#002953] opacity-70 hover:opacity-100">
                            Select
                          </span>
                        )}
                      </button>
                    );
                  })
                ) : !loadingSearch ? (
                  <div className="p-4 text-center space-y-1">
                    <p className="text-xs text-slate-500 font-medium">No matching postcode districts found.</p>
                    <p className="text-[11px] text-slate-400">Please choose one of our supported outward codes.</p>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* PART 2: INWARD CODE (ANYTHING USER TYPES) */}
        <div>
          <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
            2. Inward Code <span className="text-slate-400 font-normal lowercase">(any letters/digits)</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={inwardCode}
              onChange={(e) => setInwardCode(e.target.value.toUpperCase())}
              placeholder="e.g. 2AB"
              maxLength={4}
              className="w-full h-[44px] px-3.5 py-2 bg-white rounded-xl border border-slate-300 font-mono font-medium text-base text-slate-800 uppercase focus:outline-none focus:border-[#002953] focus:ring-2 focus:ring-[#002953]/15 shadow-xs"
            />
            {inwardCode && (
              <button
                type="button"
                onClick={() => setInwardCode('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full"
                title="Clear inward code"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Real-Time Area & Slot Availability Live Card */}
      {showLiveStatus && selectedOutward && (
        <div className={`p-3 rounded-xl border text-xs transition-all animate-in fade-in duration-150 flex items-center justify-between gap-3 ${
          isChecking
            ? 'bg-slate-50 border-slate-200 text-slate-600'
            : availabilityResult.isServiceable
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
            : 'bg-amber-50/80 border-amber-200 text-amber-900'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            {isChecking ? (
              <Loader2 className="w-4 h-4 text-slate-500 animate-spin shrink-0" />
            ) : availabilityResult.isServiceable ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-[11px]">
                  {isChecking ? (
                    'Checking slot availability...'
                  ) : availabilityResult.isServiceable ? (
                    <>
                      Slots Available in <span className="font-mono font-extrabold">{fullPostcode}</span>
                    </>
                  ) : (
                    <>
                      There is no plant in the area (<span className="font-mono font-bold">{fullPostcode}</span>)
                    </>
                  )}
                </span>
                {availabilityResult.plantName && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Plant: {availabilityResult.plantName}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {isChecking
                  ? 'Verifying active couriers and plant coverage...'
                  : availabilityResult.isServiceable
                  ? 'Doorstep pickup and delivery slots are active and ready to book.'
                  : 'We do not have an active plant servicing this postcode district yet.'}
              </p>
            </div>
          </div>

          <div className="shrink-0 text-right font-mono font-black text-xs text-[#002953] bg-white/80 px-2 py-1 rounded-lg border border-slate-200">
            {fullPostcode}
          </div>
        </div>
      )}
    </div>
  );
};
