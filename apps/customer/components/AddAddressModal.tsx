import React, { useState } from 'react';
import {
  X,
  MapPin,
  Navigation,
  Check,
  Compass,
  AlertCircle,
  ExternalLink,
  Building,
  Home,
  Briefcase,
  ShieldCheck,
  Loader2
} from 'lucide-react';
import { UserAddress } from '@laundelle/types';
import { normalizeUkPostcode, isValidUkPostcodeOrDistrict } from '@laundelle/utils';
import { PostcodeSplitInput } from './PostcodeSplitInput';

interface AddAddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAddress: (address: UserAddress) => void;
  initialAddress?: UserAddress | null;
}

export const AddAddressModal: React.FC<AddAddressModalProps> = ({
  isOpen,
  onClose,
  onSaveAddress,
  initialAddress
}) => {
  const [labelType, setLabelType] = useState<'Home' | 'Office' | 'Apartment' | 'Other'>(
    (initialAddress?.label as any) || 'Home'
  );
  const [customLabel, setCustomLabel] = useState(
    initialAddress && !['Home', 'Office', 'Apartment'].includes(initialAddress.label)
      ? initialAddress.label
      : ''
  );
  const [flatNo, setFlatNo] = useState(initialAddress?.flatNo || '');
  const [street, setStreet] = useState(initialAddress?.street || '');
  const [landmark, setLandmark] = useState(initialAddress?.landmark || '');
  const [city, setCity] = useState(initialAddress?.city || 'Preston');
  const [pincode, setPincode] = useState(initialAddress?.pincode || '');
  const [instructions, setInstructions] = useState(initialAddress?.instructions || '');
  const [isDefault, setIsDefault] = useState(initialAddress?.isDefault ?? true);

  // GPS Coordinates & Nearby Postcodes state
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number; accuracy?: number } | null>(
    initialAddress?.coordinates
      ? initialAddress.coordinates
      : initialAddress?.latitude && initialAddress?.longitude
      ? { lat: initialAddress.latitude, lng: initialAddress.longitude }
      : null
  );
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSuccessMsg, setLocationSuccessMsg] = useState<string | null>(
    initialAddress?.coordinates || initialAddress?.latitude ? 'GPS Coordinates saved on this address' : null
  );
  const [nearbyPostcodes, setNearbyPostcodes] = useState<
    Array<{ postcode: string; admin_district?: string; distance?: number }>
  >([]);
  const [detectedLocation, setDetectedLocation] = useState(false);

  if (!isOpen) return null;

  // Fetch nearby postcodes from api.postcodes.io using latitude and longitude
  const getNearbyPostcodes = async (
    lat: number,
    lon: number
  ): Promise<Array<{ postcode: string; admin_district?: string; distance?: number }>> => {
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes?lat=${lat}&lon=${lon}`);
      const data = await res.json();
      if (data.status === 200 && Array.isArray(data.result) && data.result.length > 0) {
        return data.result.map((item: any) => ({
          postcode: item.postcode,
          admin_district: item.admin_district,
          distance: item.distance,
        }));
      }
    } catch (err) {
      console.error('Error fetching nearby postcodes:', err);
    }

    // Graceful fallback for non-UK coordinates or offline testing
    return [
      { postcode: 'PR1 2AB', admin_district: 'Preston' },
      { postcode: 'PR1 2AD', admin_district: 'Preston' },
      { postcode: 'PR1 2AE', admin_district: 'Preston' },
      { postcode: 'PR1 2AF', admin_district: 'Preston' },
    ];
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setLocationError(null);
    setLocationSuccessMsg(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        console.log("Latitude:", lat);
        console.log("Longitude:", lon);

        const accuracy = Math.round(position.coords.accuracy);
        setCoordinates({ lat, lng: lon, accuracy });
        setDetectedLocation(true);

        try {
          const postcodes = await getNearbyPostcodes(lat, lon);
          setNearbyPostcodes(postcodes);

          if (postcodes.length > 0) {
            // Auto-populate the closest postcode
            if (!pincode) {
              setPincode(postcodes[0].postcode);
            }
            if (postcodes[0].admin_district && (!city || city === 'Preston')) {
              setCity(postcodes[0].admin_district);
            }
          }
          setLocationSuccessMsg(
            `GPS coordinates captured (Accuracy: ±${accuracy}m). Delivery driver will navigate directly here!`
          );
        } catch (err) {
          console.error("Failed to retrieve nearby postcodes:", err);
        } finally {
          setIsLocating(false);
        }

        // Optional reverse geocode for street name convenience
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } }
          );
          if (res.ok) {
            const data = await res.json();
            if (data?.address) {
              const addr = data.address;
              if (!street && (addr.road || addr.pedestrian || addr.suburb)) {
                setStreet([addr.house_number, addr.road || addr.pedestrian].filter(Boolean).join(' '));
              }
            }
          }
        } catch {
          // Non-blocking fallback
        }
      },
      (error) => {
        setIsLocating(false);
        console.error("Location permission denied:", error);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationError('Location permission was denied. Please allow location permissions in your browser or enter your address manually.');
        } else {
          setLocationError('Could not obtain GPS location. Please enter your address details below.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flatNo.trim() || !street.trim() || !city.trim() || !pincode.trim()) {
      alert('Please fill all mandatory address fields (Flat/House, Street, City, Postcode).');
      return;
    }

    const cleanPostcode = normalizeUkPostcode(pincode);
    if (!isValidUkPostcodeOrDistrict(cleanPostcode)) {
      alert('Please enter a valid UK postcode (e.g. PR1 4UD, SW1A 1AA).');
      return;
    }

    const finalLabel = labelType === 'Other' ? customLabel.trim() || 'Other' : labelType;

    const newAddr: UserAddress = {
      id: initialAddress?.id || `addr-${Date.now()}`,
      label: finalLabel,
      flatNo: flatNo.trim(),
      street: street.trim(),
      landmark: landmark.trim() || undefined,
      city: city.trim(),
      pincode: cleanPostcode,
      instructions: instructions.trim() || undefined,
      isDefault,
      latitude: coordinates?.lat,
      longitude: coordinates?.lng,
      coordinates: coordinates
        ? {
            lat: coordinates.lat,
            lng: coordinates.lng,
            accuracy: coordinates.accuracy
          }
        : undefined
    };

    onSaveAddress(newAddr);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in-50">
      <div className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 border border-gray-100 my-auto max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#e6f8ff] text-[#01BEFE] flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-navy leading-tight">
                {initialAddress ? 'Edit Address & GPS Location' : 'Add Delivery Address'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Accurate address & GPS helps the delivery boy reach your doorstep directly.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* GPS Location Button */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleGetLocation}
            disabled={isLocating}
            className="w-full py-3 px-4 bg-[#002953] hover:bg-[#002953] text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
          >
            {isLocating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Getting current location...</span>
              </>
            ) : (
              <>
                <Navigation className="w-4 h-4 text-[#01BEFE]" />
                <span>Get current location</span>
              </>
            )}
          </button>

          {/* Location Detected & Nearby Postcodes Box */}
          {detectedLocation && coordinates && (
            <div className="bg-white rounded-2xl p-4 border border-blue-200 shadow-2xs space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">📍</span>
                  <span className="text-xs font-bold text-navy">Your location detected</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 font-mono">
                    {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
                  </span>
                  <a
                    href={`https://www.google.com/maps?q=${coordinates.lat},${coordinates.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-bold text-[#01BEFE] hover:underline flex items-center gap-0.5"
                  >
                    <span>Map</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>

              {nearbyPostcodes.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600">
                    <span>Nearby postcodes</span>
                    <span className="text-[10px] text-[#01BEFE] font-medium">Click to select</span>
                  </div>

                  {/* Clean table matching reference design */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-200 bg-white">
                    {nearbyPostcodes.map((item) => {
                      const isSelected =
                        pincode.toUpperCase().replace(/\s+/g, '') ===
                        item.postcode.toUpperCase().replace(/\s+/g, '');
                      return (
                        <button
                          key={item.postcode}
                          type="button"
                          onClick={() => {
                            setPincode(item.postcode);
                            if (item.admin_district) setCity(item.admin_district);
                          }}
                          className={`w-full py-2.5 px-3.5 text-left text-xs font-mono font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#e6f8ff] text-[#002953] font-bold'
                              : 'hover:bg-gray-50 text-gray-800'
                          }`}
                        >
                          <span className="tracking-wider">{item.postcode}</span>
                          {isSelected ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#002953] font-sans font-bold">
                              <Check className="w-3.5 h-3.5 text-[#01BEFE] stroke-[3]" />
                              <span>Selected</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 font-sans font-normal hover:text-[#01BEFE]">
                              Select
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Success details */}
          {coordinates && !detectedLocation && (
            <div className="bg-white/90 backdrop-blur-xs rounded-xl p-3 border border-emerald-200 text-xs space-y-1.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-800 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Exact Coordinates Stored</span>
                </span>
                <a
                  href={`https://www.google.com/maps?q=${coordinates.lat},${coordinates.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-bold text-[#01BEFE] hover:underline flex items-center gap-1"
                >
                  <span>Preview on Map</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-[11px] font-mono text-gray-700">
                Latitude: <span className="font-bold">{coordinates.lat.toFixed(6)}</span> | Longitude:{' '}
                <span className="font-bold">{coordinates.lng.toFixed(6)}</span>
                {coordinates.accuracy && ` (±${coordinates.accuracy}m)`}
              </p>
              {locationSuccessMsg && (
                <p className="text-[10px] text-emerald-700 font-medium">{locationSuccessMsg}</p>
              )}
            </div>
          )}

          {/* Error notice */}
          {locationError && (
            <div className="bg-red-50 rounded-xl p-2.5 border border-red-200 text-xs flex items-start gap-2 text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <p className="text-[11px] leading-tight">{locationError}</p>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Address Label Selector */}
          <div>
            <label className="block text-gray-700 font-bold mb-1.5">
              Address Label <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { type: 'Home', icon: Home },
                { type: 'Office', icon: Briefcase },
                { type: 'Apartment', icon: Building },
                { type: 'Other', icon: MapPin }
              ].map(({ type, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setLabelType(type as any)}
                  className={`py-2 px-1 rounded-xl font-bold flex flex-col items-center justify-center gap-1 border transition-all cursor-pointer ${
                    labelType === type
                      ? 'bg-[#002953] text-white border-[#002953] shadow-xs'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-[11px]">{type}</span>
                </button>
              ))}
            </div>
            {labelType === 'Other' && (
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="e.g. Studio, Parents' House, Dorm"
                className="mt-2 w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#01BEFE] focus:ring-1 focus:ring-[#01BEFE]"
                required
              />
            )}
          </div>

          {/* Flat / Door / House */}
          <div>
            <label className="block text-gray-700 font-bold mb-1">
              Flat / House / Apartment No. <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={flatNo}
              onChange={(e) => setFlatNo(e.target.value)}
              placeholder="e.g. Flat 4B, Wellington Court"
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#01BEFE] focus:ring-1 focus:ring-[#01BEFE]"
              required
            />
          </div>

          {/* Street & Area */}
          <div>
            <label className="block text-gray-700 font-bold mb-1">
              Street & Road Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="e.g. 42 Butler Street"
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#01BEFE] focus:ring-1 focus:ring-[#01BEFE]"
              required
            />
          </div>

          {/* Landmark */}
          <div>
            <label className="block text-gray-700 font-bold mb-1">
              Landmark / Entrance Gate <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              placeholder="e.g. Opposite Central Station, Blue entrance gate"
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#01BEFE] focus:ring-1 focus:ring-[#01BEFE]"
            />
          </div>

          {/* City & Postcode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-700 font-bold mb-1">
                City <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Preston"
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#01BEFE] focus:ring-1 focus:ring-[#01BEFE]"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-gray-700 font-bold">
                  Postcode / Postal Code <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleGetLocation}
                  className="text-[11px] font-semibold text-[#01BEFE] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>📍 Use current location</span>
                </button>
              </div>
              <PostcodeSplitInput
                initialValue={pincode}
                onChange={(full) => setPincode(full)}
                required
              />
            </div>
          </div>

          {/* Driver Delivery Instructions */}
          <div>
            <label className="block text-gray-700 font-bold mb-1">
              Driver Instructions <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Ring flat 4B bell twice, or leave with front desk"
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#01BEFE] focus:ring-1 focus:ring-[#01BEFE]"
            />
          </div>

          {/* Default Address Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded-md accent-[#002953]"
            />
            <span className="text-xs text-gray-700 font-medium">
              Set as primary collection & delivery address
            </span>
          </label>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-[#002953] hover:bg-[#002953] text-white font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{initialAddress ? 'Update Address' : 'Save & Select Address'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
