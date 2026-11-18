package com.prts.stronghold.mobile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.*;

/** 对用户录屏真实画面做徽章判色回归；文字框由目视标注，不能替代真机 ML Kit 验证。 */
public final class CovenantDetectorTest {
    public static void main(String[] args) throws Exception {
        BufferedImage image=ImageIO.read(new File(args[0]));
        String[][] rows={{"炎","谢拉格","阿戈尔","伊比利亚","莱塔尼亚","萨尔贡","维多利亚","叙拉古","卡西米尔","乌萨斯"},
            {"灵巧","坚守","远见","奇迹","投资人","突袭","不屈","调和","协防干员","独行"},
            {"绝技","精准","迅捷","助力","聚合","奥术"}};
        Set<String> bans=new HashSet<>(Arrays.asList("萨尔贡","维多利亚","叙拉古","卡西米尔","乌萨斯","精准","迅捷","助力","聚合","奥术"));
        int assertions=0;
        for(int width:new int[]{2670,1920,1600}) {
            double scale=width/2670.0; int height=(int)Math.round(image.getHeight()*scale);
            BufferedImage resized=new BufferedImage(width,height,BufferedImage.TYPE_INT_RGB);
            java.awt.Graphics2D graphics=resized.createGraphics();graphics.drawImage(image,0,0,width,height,null);graphics.dispose();
            int[] pixels=resized.getRGB(0,0,width,height,null,0,width);
            for(int row=0;row<3;row++) for(int col=0;col<rows[row].length;col++) {
                String name=rows[row][col];
                for(int textHeight:new int[]{25,28,30}) {
                    int cx=(int)Math.round((364+143.5*col)*scale), top=(int)Math.round(new int[]{479,828,1070}[row]*scale);
                    int half=(int)Math.round(name.length()*14*scale), h=(int)Math.round(textHeight*scale);
                    int state=CovenantDetector.classify(pixels,width,height,cx-half,top,cx+half,top+h);
                    int expected=bans.contains(name)?-1:1;
                    if(state!=expected) throw new AssertionError(name+" width="+width+" height="+textHeight+" expected="+expected+" actual="+state);
                    assertions++;
                }
            }
            if(CovenantDetector.classify(new int[width*height],width,height,200,200,240,225)!=0) throw new AssertionError("空白图不能当作可用或受限");
            assertions++;
        }
        System.out.println("PASS "+assertions+" recorded-frame color checks; OCR text boxes require device verification.");
    }
}
