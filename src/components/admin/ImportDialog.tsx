import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUp, Download, Check, AlertCircle, Loader2 } from "lucide-react";
import { parseExcelFile, ExcelRow } from "@/lib/excelUtils";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as XLSX from 'xlsx';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onImport: (data: any[]) => Promise<void>;
  validateData: (rows: ExcelRow[]) => { validRows: any[]; errors: string[] };
  templateData: any[];
  templateFilename: string;
}

const ImportDialog = ({
  open,
  onOpenChange,
  title,
  onImport,
  validateData,
  templateData,
  templateFilename,
}: ImportDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setLoading(true);
    try {
      const rows = await parseExcelFile(selectedFile);
      const { validRows, errors: validationErrors } = validateData(rows);
      setParsedData(validRows);
      setErrors(validationErrors);
    } catch (error) {
      toast({
        title: "Parsing Error",
        description: "Could not read the Excel file. Please ensure it's a valid .xlsx or .xls file.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;
    setImporting(true);
    try {
      await onImport(parsedData);
      toast({
        title: "Import Successful",
        description: `Successfully imported ${parsedData.length} records.`,
      });
      handleClose();
    } catch (error: any) {
      toast({
        title: "Import Failed",
        description: error.message || "An error occurred during import.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedData([]);
    setErrors([]);
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
    XLSX.writeFile(workbook, templateFilename);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Upload an Excel file to import multiple records at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="excel-upload">Choose Excel File</Label>
              <Input
                id="excel-upload"
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                disabled={loading || importing}
              />
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-2" /> Download Template
            </Button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2">Parsing file...</span>
            </div>
          )}

          {!loading && (parsedData.length > 0 || errors.length > 0) && (
            <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
              {errors.length > 0 && (
                <div className="bg-destructive/10 p-3 rounded-lg border border-destructive/20 overflow-y-auto max-h-32">
                  <div className="flex items-center text-destructive mb-1 font-semibold">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Validation Errors ({errors.length})
                  </div>
                  <ul className="text-sm text-destructive list-disc list-inside">
                    {errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {parsedData.length > 0 && (
                <div className="flex-1 overflow-hidden flex flex-col border rounded-md">
                  <div className="bg-muted/50 p-2 text-sm font-medium border-b flex items-center">
                    <Check className="w-4 h-4 mr-2 text-success" />
                    Valid Records Preview ({parsedData.length})
                  </div>
                  <ScrollArea className="flex-1">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {Object.keys(parsedData[0]).map((key) => (
                            <TableHead key={key}>{key}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedData.slice(0, 50).map((row, i) => (
                          <TableRow key={i}>
                            {Object.values(row).map((val: any, j) => (
                              <TableCell key={j} className="max-w-[150px] truncate">
                                {String(val)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {parsedData.length > 50 && (
                      <div className="p-2 text-center text-xs text-muted-foreground">
                        Showing first 50 records...
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleImport}
            disabled={parsedData.length === 0 || importing}
            className="min-w-[100px]"
          >
            {importing ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <FileUp className="w-4 h-4 mr-2" />
            )}
            {importing ? "Importing..." : "Confirm Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportDialog;
