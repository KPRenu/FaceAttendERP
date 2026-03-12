import * as XLSX from 'xlsx';

export interface ExcelRow {
  [key: string]: any;
}

const formatExcelTime = (val: any): string => {
  if (typeof val === 'number') {
    // Excel time is a fraction of a 24h day
    const totalMinutes = Math.round(val * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  return String(val);
};

export const parseExcelFile = (file: File): Promise<ExcelRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        resolve(jsonData as ExcelRow[]);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

export const validateClassData = (rows: ExcelRow[]) => {
  const errors: string[] = [];
  const validRows = rows.map((row, index) => {
    const className = row['Class Name'] || row['class_name'];
    const department = row['Department'] || row['department'];
    const section = row['Section'] || row['section'];
    const semester = row['Semester'] || row['semester'];

    if (!className || !department || !section || !semester) {
      errors.push(`Row ${index + 1}: Missing required fields (Class Name, Department, Section, Semester)`);
      return null;
    }

    return {
      class_name: String(className),
      department: String(department).toUpperCase(),
      section: String(section).toUpperCase(),
      semester: parseInt(semester),
      is_deleted: false
    };
  }).filter(Boolean);

  return { validRows, errors };
};

export const validateSubjectData = (rows: ExcelRow[]) => {
  const errors: string[] = [];
  const validRows = rows.map((row, index) => {
    const subjectName = row['Subject Name'] || row['subject_name'];
    const subjectCode = row['Subject Code'] || row['subject_code'];
    const department = row['Department'] || row['department'];
    const semester = row['Semester'] || row['semester'];

    if (!subjectName || !subjectCode || !department || !semester) {
      errors.push(`Row ${index + 1}: Missing required fields (Subject Name, Subject Code, Department, Semester)`);
      return null;
    }

    return {
      subject_name: String(subjectName),
      subject_code: String(subjectCode),
      department: String(department).toUpperCase(),
      semester: parseInt(semester),
      is_deleted: false
    };
  }).filter(Boolean);

  return { validRows, errors };
};

export const validateTimetableData = (
  rows: ExcelRow[],
  teachersMap: Record<string, string>,
  classesMap: Record<string, string>,
  subjectsMap: Record<string, string>
) => {
  const errors: string[] = [];
  const validRows = rows.map((row, index) => {
    const teacherEmail = row['Teacher Email'] || row['teacher_email'];
    const className = row['Class Name'] || row['class_name'];
    const subjectName = row['Subject Name'] || row['subject_name'];
    const day = row['Day'] || row['day'];
    const startTimeRaw = row['Start Time'] || row['start_time'];
    const endTimeRaw = row['End Time'] || row['end_time'];
    const roomNo = row['Room No'] || row['room_no'];

    if (!teacherEmail || !className || !subjectName || !day || !startTimeRaw || !endTimeRaw || !roomNo) {
      errors.push(`Row ${index + 1}: Missing required fields`);
      return null;
    }

    const startTime = formatExcelTime(startTimeRaw);
    const endTime = formatExcelTime(endTimeRaw);

    const teacher_id = teachersMap[teacherEmail.toLowerCase()];
    const class_id = classesMap[className];
    const subject_id = subjectsMap[subjectName];

    if (!teacher_id) errors.push(`Row ${index + 1}: Teacher with email ${teacherEmail} not found`);
    if (!class_id) errors.push(`Row ${index + 1}: Class ${className} not found`);
    if (!subject_id) errors.push(`Row ${index + 1}: Subject ${subjectName} not found`);

    if (!teacher_id || !class_id || !subject_id) return null;

    return {
      teacher_id,
      class_id,
      subject_id,
      day_of_week: day,
      start_time: startTime,
      end_time: endTime,
      room_no: String(roomNo),
      is_deleted: false
    };
  }).filter(Boolean);

  return { validRows, errors };
};
