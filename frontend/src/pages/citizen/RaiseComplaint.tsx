import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, MapPin, Upload, Image, Loader2, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { complaintsApi, type ComplaintPayload } from "@/services/complaintsApi";
import { DEPARTMENTS } from "@/config/departments";
import { Card } from "@/components/ui/card";

interface LocationSuggestion {
  id: string;
  title: string;
  address: string;
  context: string;
  latitude: number;
  longitude: number;
}

interface PhotonProperties {
  [key: string]: string | number | undefined;
  name?: string;
  housenumber?: string;
  street?: string;
  district?: string;
  locality?: string;
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  osm_id?: string | number;
}

interface PhotonFeature {
  properties?: PhotonProperties;
  geometry?: { coordinates?: unknown[] };
}

const CATEGORY_TITLE_SUGGESTIONS: Record<string, string[]> = {
  "Road & Infrastructure": [
    "Pothole needs urgent repair",
    "Damaged road surface reported",
    "Broken streetlight needs attention",
    "Blocked road requires clearing",
  ],
  "Water Supply": [
    "Water supply interruption reported",
    "Leaking water pipe needs repair",
    "Low water pressure in the area",
    "Contaminated water reported",
  ],
  Electricity: [
    "Power outage reported in the area",
    "Damaged electric pole needs repair",
    "Streetlight is not working",
    "Exposed electrical wire is unsafe",
  ],
  Environment: [
    "Garbage collection is required",
    "Illegal dumping reported",
    "Open drain needs cleaning",
    "Air pollution concern reported",
  ],
};

const DESCRIPTION_TITLE_RULES = [
  { keywords: ["pothole", "crater", "road"], title: "Road damage needs repair" },
  { keywords: ["streetlight", "street light", "lamp"], title: "Streetlight needs repair" },
  { keywords: ["leak", "pipe", "burst"], title: "Water pipe leak reported" },
  { keywords: ["outage", "blackout", "no electricity", "power cut"], title: "Electricity outage reported" },
  { keywords: ["wire", "transformer", "pole"], title: "Electrical infrastructure is damaged" },
  { keywords: ["garbage", "waste", "trash", "dump"], title: "Waste disposal issue reported" },
  { keywords: ["smoke", "pollution", "burning"], title: "Pollution concern reported" },
  { keywords: ["drain", "sewage", "flood"], title: "Drainage issue needs attention" },
];

const POOR_LOCATION_ACCURACY_METRES = 100;

const getTitleSuggestions = (selectedCategory: string, description: string) => {
  const normalizedDescription = description.toLowerCase();
  const descriptionSuggestions = DESCRIPTION_TITLE_RULES
    .filter((rule) => rule.keywords.some((keyword) => normalizedDescription.includes(keyword)))
    .map((rule) => rule.title);

  return Array.from(new Set([
    ...descriptionSuggestions,
    ...(CATEGORY_TITLE_SUGGESTIONS[selectedCategory] || []),
  ])).slice(0, 5);
};

const formatPhotonAddress = (properties: PhotonProperties | undefined): string => {
  if (!properties) return "";
  const parts: string[] = [];
  if (properties.name) parts.push(properties.name);
  const street = [properties.housenumber, properties.street].filter(Boolean).join(" ");
  if (street && !parts.includes(street) && properties.name !== street) parts.push(street);
  const locality = properties.district || properties.locality || properties.suburb || properties.neighbourhood;
  if (locality && !parts.includes(locality)) parts.push(locality);
  const city = properties.city || properties.town || properties.village || properties.county;
  if (city && !parts.includes(city)) parts.push(city);
  if (properties.state && !parts.includes(properties.state)) parts.push(properties.state);
  if (properties.postcode && !parts.includes(properties.postcode)) parts.push(properties.postcode);
  if (properties.country && !parts.includes(properties.country)) parts.push(properties.country);
  return parts.filter(Boolean).join(", ");
};

const formatPhotonSuggestion = (feature: PhotonFeature): LocationSuggestion | null => {
  const props = feature?.properties;
  const coordinates = feature?.geometry?.coordinates;
  if (!props || !coordinates || coordinates.length < 2) return null;

  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (isNaN(lon) || isNaN(lat)) return null;

  const fullAddress = formatPhotonAddress(props);
  const contextParts = [
    props.district || props.locality || props.suburb,
    props.city || props.town || props.village,
    props.state,
    props.country,
  ].filter(Boolean);

  const context = Array.from(new Set(contextParts)).join(", ");

  return {
    id: `${props.osm_id || Math.random()}-${lat}-${lon}`,
    title: props.name || fullAddress || "Location",
    address: fullAddress || props.name || "",
    context,
    latitude: lat,
    longitude: lon,
  };
};

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const RaiseComplaint: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [category, setCategory] = useState<string>(DEPARTMENTS[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [formValues, setFormValues] = useState({ title: "", description: "", location: "" });

  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const clientRequestIdRef = useRef<string>(
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );

  useEffect(() => {
    return () => {
      if (filePreview) {
        URL.revokeObjectURL(filePreview);
      }
    };
  }, [filePreview]);

  const handleValidateAndSetFile = (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setFileError("Invalid file type. Please select a JPEG, PNG, or WebP image.");
      return false;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError("File size exceeds 5MB limit. Please select a smaller photo.");
      return false;
    }

    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }

    setSelectedFile(file);
    setFilePreview(URL.createObjectURL(file));
    setFileError(null);
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleValidateAndSetFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleValidateAndSetFile(file);
    }
  };

  const handleRemoveFile = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }
    setSelectedFile(null);
    setFilePreview(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleCategoryChange = (val: string) => {
    setCategory(val);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleLocationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setFormValues((prev) => ({ ...prev, location: value }));

    // Requirement 8: Clear coordinates if user edits address after selecting a suggestion
    setCoords(null);
    setLocationAccuracy(null);
    setLocationError(null);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setSearchError(null);
      setSearching(false);
      setIsDropdownOpen(false);
      return;
    }

    setSearching(true);
    setSearchError(null);
    setIsDropdownOpen(true);

    searchTimeoutRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(`Photon API error (HTTP ${response.status})`);
        }

        const data = await response.json();
        const rawFeatures = Array.isArray(data?.features) ? data.features : [];
        const results = rawFeatures
          .map(formatPhotonSuggestion)
          .filter((item): item is LocationSuggestion => item !== null && item.address.length > 0);

        setSuggestions(results);
        setSearchError(null);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        console.warn("[Photon Autocomplete] Error:", err);
        setSearchError("Unable to fetch suggestions. You can enter the location manually.");
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const handleSelectSuggestion = (suggestion: LocationSuggestion) => {
    setFormValues((prev) => ({ ...prev, location: suggestion.address }));
    setCoords({ latitude: suggestion.latitude, longitude: suggestion.longitude });
    setLocationAccuracy(null);
    setSuggestions([]);
    setIsDropdownOpen(false);
    setSearchError(null);
    setLocationError(null);
  };

  const handleUseCurrentLocation = () => {
    setIsDropdownOpen(false);
    setSuggestions([]);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (!navigator.geolocation) {
      const msg = "Geolocation is not supported by your browser.";
      setLocationError(msg);
      toast({ title: "Location Error", description: msg, variant: "destructive" });
      return;
    }

    setLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        // Keep the browser-provided coordinates and accuracy; reverse geocoding only supplies text.
        setCoords({ latitude: lat, longitude: lon });
        setLocationAccuracy(accuracy);

        if (accuracy > POOR_LOCATION_ACCURACY_METRES) {
          setLocationError(
            `Location accuracy is approximately ${Math.round(accuracy)} metres. You can retry or edit the address manually.`
          );
        }

        try {
          const response = await fetch(
            `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`
          );

          if (!response.ok) {
            throw new Error(`Reverse geocoding failed (HTTP ${response.status})`);
          }

          const data = await response.json();
          const firstFeature = data?.features?.[0];
          const address = firstFeature ? formatPhotonAddress(firstFeature.properties) : "";

          if (address) {
            setFormValues((prev) => ({ ...prev, location: address }));
            toast({
              title: "Location detected",
              description: accuracy > POOR_LOCATION_ACCURACY_METRES
                ? `Address populated, but accuracy is approximately ${Math.round(accuracy)} metres.`
                : "Address populated from your current coordinates.",
            });
          } else {
            const warning = "Coordinates obtained, but readable address was not found. Please enter address manually.";
            setLocationError(warning);
            toast({
              title: "Address Lookup",
              description: warning,
            });
          }
        } catch (err: unknown) {
          console.warn("[Photon Geocoding] Reverse lookup failed:", err);
          const warning = "Could not fetch address for your location. Coordinates saved; please enter address manually.";
          setLocationError(warning);
          toast({
            title: "Address Lookup Failed",
            description: warning,
            variant: "destructive",
          });
        } finally {
          setLocating(false);
        }
      },
      (error) => {
        setLocating(false);
        setCoords(null);
        setLocationAccuracy(null);
        console.warn(`[Geolocation] Error code ${error.code}: ${error.message}`, {
          code: error.code,
          message: error.message,
        });
        let errorMsg = "Unable to retrieve your location.";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = "Location permission denied. Please allow location access in your browser settings.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = "Location information is unavailable. Please check your network or GPS.";
            break;
          case error.TIMEOUT:
            errorMsg = "Location request timed out. Please try again.";
            break;
          default:
            errorMsg = error.message || errorMsg;
            break;
        }
        setLocationError(errorMsg);
        toast({
          title: "Location Error",
          description: errorMsg,
          variant: "destructive",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0,
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      let payload: ComplaintPayload | FormData;

      if (selectedFile) {
        const formData = new FormData();
        formData.append("title", formValues.title.trim());
        formData.append("description", formValues.description.trim());
        formData.append("category", category);
        formData.append("location", formValues.location.trim());
        if (coords?.latitude != null) formData.append("latitude", String(coords.latitude));
        if (coords?.longitude != null) formData.append("longitude", String(coords.longitude));
        if (clientRequestIdRef.current) formData.append("clientRequestId", clientRequestIdRef.current);
        formData.append("image", selectedFile);
        payload = formData;
      } else {
        payload = {
          title: formValues.title.trim(),
          description: formValues.description.trim(),
          category,
          location: formValues.location.trim(),
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          clientRequestId: clientRequestIdRef.current,
        };
      }

      const created = await complaintsApi.create(payload);

      const aiStatus = created._submissionMeta?.aiStatus || created.aiAnalysis?.status;
      if (aiStatus === "completed") {
        toast({
          title: "Complaint Submitted",
          description: `Complaint recorded under ${category} with AI analysis completed.`,
        });
      } else {
        toast({
          title: "Complaint Submitted",
          description:
            "Your complaint has been submitted successfully. AI-assisted analysis is temporarily unavailable. Your complaint has been recorded and may require manual review.",
        });
      }
      navigate("/citizen/complaints");
    } catch (err: unknown) {
      toast({ title: "Submission failed", description: err instanceof Error ? err.message : "Unable to submit complaint.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const titleSuggestions = getTitleSuggestions(category, formValues.description);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Raise a Complaint</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Describe your issue and upload a photo for AI-assisted routing</p>
      </div>

      <Card className="glass-card">
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                value={formValues.title}
                onChange={handleInputChange}
                placeholder="Brief summary of your complaint"
                className="mt-1.5"
                required
              />
              {titleSuggestions.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-1.5">Suggested titles</p>
                  <div className="flex flex-wrap gap-1.5">
                    {titleSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setFormValues((prev) => ({ ...prev, title: suggestion }))}
                        className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger id="category" className="mt-1.5">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {category && (
                <p className="text-xs text-muted-foreground mt-1">
                  Department: {category}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formValues.description}
                onChange={handleInputChange}
                placeholder="Provide detailed description..."
                className="mt-1.5 min-h-[120px]"
                required
              />
            </div>

            <div>
              <Label htmlFor="location">Location</Label>
              <div className="mt-1.5 flex flex-col sm:flex-row gap-2">
                <div ref={dropdownRef} className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
                  <Input
                    id="location"
                    name="location"
                    value={formValues.location}
                    onChange={handleLocationChange}
                    onFocus={() => {
                      if (formValues.location.trim().length >= 3 && (suggestions.length > 0 || searching || searchError)) {
                        setIsDropdownOpen(true);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setIsDropdownOpen(false);
                      }
                    }}
                    placeholder="Area, sector, landmark (min 3 chars for suggestions)..."
                    className="pl-10"
                    autoComplete="off"
                    required
                  />

                  {/* Suggestions Dropdown */}
                  {isDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1.5 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden backdrop-blur-md">
                      {searching && (
                        <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                          <span>Searching locations...</span>
                        </div>
                      )}

                      {!searching && searchError && (
                        <div className="p-3 text-xs text-destructive">
                          {searchError}
                        </div>
                      )}

                      {!searching && !searchError && suggestions.length === 0 && (
                        <div className="p-3 text-xs text-muted-foreground">
                          No matching locations found
                        </div>
                      )}

                      {!searching && !searchError && suggestions.length > 0 && (
                        <ul className="max-h-60 overflow-y-auto divide-y divide-border/40 py-1">
                          {suggestions.map((item) => (
                            <li key={item.id}>
                              <button
                                type="button"
                                onClick={() => handleSelectSuggestion(item)}
                                className="w-full text-left p-2.5 hover:bg-accent hover:text-accent-foreground transition-colors flex items-start gap-2.5 focus:bg-accent focus:outline-none"
                              >
                                <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium text-foreground truncate">
                                    {item.title}
                                  </p>
                                  {item.context && (
                                    <p className="text-[11px] text-muted-foreground truncate">
                                      {item.context}
                                    </p>
                                  )}
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleUseCurrentLocation}
                  disabled={locating || loading}
                  className="shrink-0"
                >
                  {locating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Locating...
                    </>
                  ) : (
                    "📍 Use My Current Location"
                  )}
                </Button>
              </div>
              {locationError && (
                <p className="text-xs text-destructive mt-1.5">{locationError}</p>
              )}
              {coords && (
                <p className="text-xs text-muted-foreground mt-1">
                  Attached coordinates: {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                </p>
              )}
              {locationAccuracy !== null && (
                <p className={`text-xs mt-1 ${locationAccuracy > POOR_LOCATION_ACCURACY_METRES ? "text-warning" : "text-muted-foreground"}`}>
                  Reported accuracy: approximately {Math.round(locationAccuracy)} metres
                </p>
              )}
            </div>

            {/* Photo Evidence Upload */}
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="evidence-file-input">Photo Evidence</Label>
                {selectedFile && (
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </span>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                id="evidence-file-input"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
                disabled={loading}
              />

              {filePreview ? (
                <div className="mt-1.5 relative rounded-lg border border-border bg-card p-4 overflow-hidden">
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="relative w-28 h-28 rounded-md overflow-hidden bg-muted border border-border/60 shrink-0">
                      <img
                        src={filePreview}
                        alt="Evidence preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0 text-center sm:text-left">
                      <p className="text-sm font-medium text-foreground truncate">
                        {selectedFile?.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {selectedFile ? formatFileSize(selectedFile.size) : ""} • Ready for submission
                      </p>
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={loading}
                        >
                          Change Photo
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleRemoveFile}
                          disabled={loading}
                          className="text-destructive hover:text-destructive"
                        >
                          <X className="w-3.5 h-3.5 mr-1" /> Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload photo evidence"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`mt-1.5 border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-foreground font-medium">Click to upload photo evidence</p>
                  <p className="text-xs text-muted-foreground mt-1">or drag and drop here (JPG, PNG, WebP up to 5MB)</p>
                </div>
              )}

              {fileError && (
                <p className="text-xs text-destructive mt-1.5">{fileError}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Submitting..." : (
                <><Send className="w-4 h-4 mr-2" /> Submit Complaint</>
              )}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
};

export default RaiseComplaint;
