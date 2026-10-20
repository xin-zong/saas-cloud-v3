package com.enerlution.ems.business;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.*;
/** Single-sheet raw history workbook. Literal inline strings never execute spreadsheet formulas. */
final class DeviceHistoryWorkbook {
 static byte[] write(String name,List<List<String>> rows){
  if(name.length()>31||name.matches(".*[\\[\\]:*?/\\\\].*"))throw new IllegalArgumentException("Invalid sheet name");
  try(var out=new ByteArrayOutputStream();var zip=new ZipOutputStream(out,StandardCharsets.UTF_8)){
   entry(zip,"[Content_Types].xml","<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>");
   entry(zip,"_rels/.rels","<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
   entry(zip,"xl/workbook.xml","<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\""+ReportXlsx.xml(name)+"\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>");
   entry(zip,"xl/_rels/workbook.xml.rels","<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>");
   zip.putNextEntry(new ZipEntry("xl/worksheets/sheet1.xml"));
   var writer=new OutputStreamWriter(zip,StandardCharsets.UTF_8);
   writer.write("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>");
   for(int r=0;r<rows.size();r++){
    writer.write("<row r=\""+(r+1)+"\">");
    for(int c=0;c<rows.get(r).size();c++){
     String value=Objects.toString(rows.get(r).get(c),"");if(value.length()>32767)throw new IllegalArgumentException("Excel cell too long");
     writer.write("<c r=\""+ReportXlsx.column(c)+(r+1)+"\" t=\"inlineStr\"><is><t xml:space=\"preserve\">"+ReportXlsx.xml(value)+"</t></is></c>");
    }writer.write("</row>");
   }writer.write("</sheetData></worksheet>");writer.flush();zip.closeEntry();zip.finish();return out.toByteArray();
  }catch(IOException e){throw new IllegalStateException("History workbook failed",e);}
 }
 private static void entry(ZipOutputStream zip,String name,String text)throws IOException{zip.putNextEntry(new ZipEntry(name));zip.write(text.getBytes(StandardCharsets.UTF_8));zip.closeEntry();}
}
