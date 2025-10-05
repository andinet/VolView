// VISTA3D anatomical structure labels based on MONAI model zoo metadata
// https://github.com/Project-MONAI/model-zoo/blob/dev/models/vista3d/configs/metadata.json

export interface Vista3dLabel {
  id: number;
  name: string;
  category: string;
}

export const VISTA3D_LABELS: Vista3dLabel[] = [
  { id: 1, name: "liver", category: "organs" },
  { id: 2, name: "kidney", category: "organs" },
  { id: 3, name: "spleen", category: "organs" },
  { id: 4, name: "pancreas", category: "organs" },
  { id: 5, name: "right kidney", category: "organs" },
  { id: 6, name: "aorta", category: "vessels" },
  { id: 7, name: "inferior vena cava", category: "vessels" },
  { id: 8, name: "right adrenal gland", category: "organs" },
  { id: 9, name: "left adrenal gland", category: "organs" },
  { id: 10, name: "gallbladder", category: "organs" },
  { id: 11, name: "esophagus", category: "organs" },
  { id: 12, name: "stomach", category: "organs" },
  { id: 13, name: "duodenum", category: "organs" },
  { id: 14, name: "left kidney", category: "organs" },
  { id: 15, name: "bladder", category: "organs" },
  { id: 16, name: "prostate or uterus", category: "organs" },
  { id: 17, name: "portal vein and splenic vein", category: "vessels" },
  { id: 18, name: "rectum", category: "organs" },
  { id: 19, name: "small bowel", category: "organs" },
  { id: 20, name: "lung", category: "organs" },
  { id: 21, name: "bone", category: "skeleton" },
  { id: 22, name: "brain", category: "organs" },
  { id: 23, name: "lung tumor", category: "pathology" },
  { id: 24, name: "pancreatic tumor", category: "pathology" },
  { id: 25, name: "hepatic vessel", category: "vessels" },
  { id: 26, name: "hepatic tumor", category: "pathology" },
  { id: 27, name: "colon cancer primaries", category: "pathology" },
  { id: 28, name: "left lung upper lobe", category: "organs" },
  { id: 29, name: "left lung lower lobe", category: "organs" },
  { id: 30, name: "right lung upper lobe", category: "organs" },
  { id: 31, name: "right lung middle lobe", category: "organs" },
  { id: 32, name: "right lung lower lobe", category: "organs" },
  
  // Vertebrae
  { id: 33, name: "vertebrae L5", category: "skeleton" },
  { id: 34, name: "vertebrae L4", category: "skeleton" },
  { id: 35, name: "vertebrae L3", category: "skeleton" },
  { id: 36, name: "vertebrae L2", category: "skeleton" },
  { id: 37, name: "vertebrae L1", category: "skeleton" },
  { id: 38, name: "vertebrae T12", category: "skeleton" },
  { id: 39, name: "vertebrae T11", category: "skeleton" },
  { id: 40, name: "vertebrae T10", category: "skeleton" },
  { id: 41, name: "vertebrae T9", category: "skeleton" },
  { id: 42, name: "vertebrae T8", category: "skeleton" },
  { id: 43, name: "vertebrae T7", category: "skeleton" },
  { id: 44, name: "vertebrae T6", category: "skeleton" },
  { id: 45, name: "vertebrae T5", category: "skeleton" },
  { id: 46, name: "vertebrae T4", category: "skeleton" },
  { id: 47, name: "vertebrae T3", category: "skeleton" },
  { id: 48, name: "vertebrae T2", category: "skeleton" },
  { id: 49, name: "vertebrae T1", category: "skeleton" },
  { id: 50, name: "vertebrae C7", category: "skeleton" },
  { id: 51, name: "vertebrae C6", category: "skeleton" },
  { id: 52, name: "vertebrae C5", category: "skeleton" },
  { id: 53, name: "vertebrae C4", category: "skeleton" },
  { id: 54, name: "vertebrae C3", category: "skeleton" },
  { id: 55, name: "vertebrae C2", category: "skeleton" },
  { id: 56, name: "vertebrae C1", category: "skeleton" },
  
  { id: 57, name: "trachea", category: "organs" },
  { id: 58, name: "left iliac artery", category: "vessels" },
  { id: 59, name: "right iliac artery", category: "vessels" },
  { id: 60, name: "left iliac vena", category: "vessels" },
  { id: 61, name: "right iliac vena", category: "vessels" },
  { id: 62, name: "colon", category: "organs" },
  
  // Ribs
  { id: 63, name: "left rib 1", category: "skeleton" },
  { id: 64, name: "left rib 2", category: "skeleton" },
  { id: 65, name: "left rib 3", category: "skeleton" },
  { id: 66, name: "left rib 4", category: "skeleton" },
  { id: 67, name: "left rib 5", category: "skeleton" },
  { id: 68, name: "left rib 6", category: "skeleton" },
  { id: 69, name: "left rib 7", category: "skeleton" },
  { id: 70, name: "left rib 8", category: "skeleton" },
  { id: 71, name: "left rib 9", category: "skeleton" },
  { id: 72, name: "left rib 10", category: "skeleton" },
  { id: 73, name: "left rib 11", category: "skeleton" },
  { id: 74, name: "left rib 12", category: "skeleton" },
  { id: 75, name: "right rib 1", category: "skeleton" },
  { id: 76, name: "right rib 2", category: "skeleton" },
  { id: 77, name: "right rib 3", category: "skeleton" },
  { id: 78, name: "right rib 4", category: "skeleton" },
  { id: 79, name: "right rib 5", category: "skeleton" },
  { id: 80, name: "right rib 6", category: "skeleton" },
  { id: 81, name: "right rib 7", category: "skeleton" },
  { id: 82, name: "right rib 8", category: "skeleton" },
  { id: 83, name: "right rib 9", category: "skeleton" },
  { id: 84, name: "right rib 10", category: "skeleton" },
  { id: 85, name: "right rib 11", category: "skeleton" },
  { id: 86, name: "right rib 12", category: "skeleton" },
  
  // Major bones
  { id: 87, name: "left humerus", category: "skeleton" },
  { id: 88, name: "right humerus", category: "skeleton" },
  { id: 89, name: "left scapula", category: "skeleton" },
  { id: 90, name: "right scapula", category: "skeleton" },
  { id: 91, name: "left clavicula", category: "skeleton" },
  { id: 92, name: "right clavicula", category: "skeleton" },
  { id: 93, name: "left femur", category: "skeleton" },
  { id: 94, name: "right femur", category: "skeleton" },
  { id: 95, name: "left hip", category: "skeleton" },
  { id: 96, name: "right hip", category: "skeleton" },
  { id: 97, name: "sacrum", category: "skeleton" },
  
  // Muscles
  { id: 98, name: "left gluteus maximus", category: "muscles" },
  { id: 99, name: "right gluteus maximus", category: "muscles" },
  { id: 100, name: "left gluteus medius", category: "muscles" },
  { id: 101, name: "right gluteus medius", category: "muscles" },
  { id: 102, name: "left gluteus minimus", category: "muscles" },
  { id: 103, name: "right gluteus minimus", category: "muscles" },
  { id: 104, name: "left autochthon", category: "muscles" },
  { id: 105, name: "right autochthon", category: "muscles" },
  { id: 106, name: "left iliopsoas", category: "muscles" },
  { id: 107, name: "right iliopsoas", category: "muscles" },
  
  // Cardiovascular
  { id: 108, name: "left atrial appendage", category: "cardiovascular" },
  { id: 109, name: "brachiocephalic trunk", category: "vessels" },
  { id: 110, name: "left brachiocephalic vein", category: "vessels" },
  { id: 111, name: "right brachiocephalic vein", category: "vessels" },
  { id: 112, name: "left common carotid artery", category: "vessels" },
  { id: 113, name: "right common carotid artery", category: "vessels" },
  { id: 114, name: "costal cartilages", category: "skeleton" },
  { id: 115, name: "heart", category: "cardiovascular" },
  
  // Additional structures
  { id: 116, name: "left kidney cyst", category: "pathology" },
  { id: 117, name: "right kidney cyst", category: "pathology" },
  { id: 118, name: "prostate", category: "organs" },
  { id: 119, name: "pulmonary vein", category: "vessels" },
  { id: 120, name: "skull", category: "skeleton" },
  { id: 121, name: "spinal cord", category: "organs" },
  { id: 122, name: "sternum", category: "skeleton" },
  { id: 123, name: "left subclavian artery", category: "vessels" },
  { id: 124, name: "right subclavian artery", category: "vessels" },
  { id: 125, name: "superior vena cava", category: "vessels" },
  { id: 126, name: "thyroid gland", category: "organs" },
  { id: 127, name: "vertebrae S1", category: "skeleton" },
  { id: 128, name: "bone lesion", category: "pathology" },
  { id: 129, name: "kidney mass", category: "pathology" },
  { id: 130, name: "liver tumor", category: "pathology" },
  { id: 131, name: "vertebrae L6", category: "skeleton" },
  { id: 132, name: "airway", category: "organs" },
];

// Helper functions
export const getLabelsByCategory = (category: string) => 
  VISTA3D_LABELS.filter(label => label.category === category);

export const getLabelCategories = () => 
  [...new Set(VISTA3D_LABELS.map(label => label.category))];

export const getLabelById = (id: number) => 
  VISTA3D_LABELS.find(label => label.id === id);

export const getLabelByName = (name: string) => 
  VISTA3D_LABELS.find(label => label.name.toLowerCase() === name.toLowerCase());