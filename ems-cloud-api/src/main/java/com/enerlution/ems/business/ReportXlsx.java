package com.enerlution.ems.business;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.*;
/** Minimal OOXML workbook using inline text cells. Does not interpret formulas or execute content. */
final class ReportXlsx {
 private ReportXlsx(){}
 static byte[] write(List<String> columns,List<List<String>> rows,List<String> notes){
  try(var output=new ByteArrayOutputStream();var zip=new ZipOutputStream(output,StandardCharsets.UTF_8)){
   entry(zip,"[Content_Types].xml","<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/worksheets/sheet2.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>");
   entry(zip,"_rels/.rels","<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
   entry(zip,"xl/workbook.xml","<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Report\" sheetId=\"1\" r:id=\"rId1\"/><sheet name=\"Read me\" sheetId=\"2\" r:id=\"rId2\"/></sheets></workbook>");
   entry(zip,"xl/_rels/workbook.xml.rels","<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet2.xml\"/></Relationships>");
   var table=new ArrayList<List<String>>();table.add(columns);table.addAll(rows);entry(zip,"xl/worksheets/sheet1.xml",sheet(table));
   var help=new ArrayList<List<String>>();for(String note:notes)help.add(List.of(note));entry(zip,"xl/worksheets/sheet2.xml",sheet(help));zip.finish();return output.toByteArray();
  }catch(IOException e){throw new IllegalStateException("XLSX serialization failed",e);}
 }
 private static void entry(ZipOutputStream zip,String name,String value)throws IOException{var entry=new ZipEntry(name);entry.setTime(0);zip.putNextEntry(entry);zip.write(value.getBytes(StandardCharsets.UTF_8));zip.closeEntry();}
 static String column(int index){var out=new StringBuilder();for(int n=index+1;n>0;n=(n-1)/26)out.insert(0,(char)('A'+(n-1)%26));return out.toString();}
 static String xml(String value){var clean=new StringBuilder();Objects.requireNonNullElse(value,"").codePoints().filter(c->c==9||c==10||c==13||c>=32&&c<=0xD7FF||c>=0xE000&&c<=0xFFFD||c>=0x10000&&c<=0x10FFFF).forEach(clean::appendCodePoint);return clean.toString().replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;");}
 private static String sheet(List<List<String>> rows){var xml=new StringBuilder("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetViews><sheetView workbookViewId=\"0\"/></sheetViews><sheetData>");for(int r=0;r<rows.size();r++){xml.append("<row r=\"").append(r+1).append("\">");for(int c=0;c<rows.get(r).size();c++){String value=Objects.requireNonNullElse(rows.get(r).get(c),"");if(value.length()>32767)throw new IllegalArgumentException("Cell text exceeds Excel limit");xml.append("<c r=\"").append(column(c)).append(r+1).append("\" t=\"inlineStr\"><is><t xml:space=\"preserve\">").append(xml(value)).append("</t></is></c>");}xml.append("</row>");}return xml.append("</sheetData></worksheet>").toString();}
}
